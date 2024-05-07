import path from "path";
import { MarkdownFile } from "./adaptors";
import { convertMDtoADF } from "./MdToADF";
import { folderFile } from "./FolderFile";
import { JSONDocNode } from "@atlaskit/editor-json-transformer";
import { LocalAdfFile, LocalAdfFileTreeNode } from "./Publisher";
import { ConfluenceSettings } from "./Settings";
import * as fs from "fs";

const findCommonPath = (paths: string[]): string => {
	const [firstPath, ...rest] = paths;
	if (!firstPath) {
		throw new Error("No Paths Provided");
	}
	const commonPathParts = firstPath.split(path.sep);

	rest.forEach((filePath) => {
		const pathParts = filePath.split(path.sep);
		for (let i = 0; i < commonPathParts.length; i++) {
			if (pathParts[i] !== commonPathParts[i]) {
				commonPathParts.splice(i);
				break;
			}
		}
	});

	return commonPathParts.join(path.sep);
};

const createTreeNode = (name: string): LocalAdfFileTreeNode => ({
	name,
	children: [],
});

const addFileToTree = (
	treeNode: LocalAdfFileTreeNode,
	file: MarkdownFile,
	relativePath: string,
	settings: ConfluenceSettings,
) => {
	const [folderName, ...remainingPath] = relativePath.split(path.sep);
	if (folderName === undefined) {
		throw new Error("Unable to get folder name");
	}

	if (remainingPath.length === 0) {
		const adfFile = convertMDtoADF(file, settings);
		const sortOrder = Number.parseInt(
			file.frontmatter["sort-order"] as string,
		);
		adfFile.sortOrder = 100000;
		if (Number.isInteger(sortOrder)) {
			adfFile.sortOrder = sortOrder;
		}
		treeNode.children.push({
			...createTreeNode(folderName),
			file: adfFile,
		});
	} else {
		let childNode = treeNode.children.find(
			(node) => node.name === folderName,
		);

		if (!childNode) {
			childNode = createTreeNode(folderName);
			treeNode.children.push(childNode);
		}

		addFileToTree(childNode, file, remainingPath.join(path.sep), settings);
	}
	treeNode.children.sort((a, b) => sortFiles(a.file, b.file));
};

const processNode = (commonPath: string, node: LocalAdfFileTreeNode) => {
	if (!node.file) {
		let indexFile = node.children.find(
			(child) => path.parse(child.name).name === node.name,
		);
		if (!indexFile) {
			// Support FolderFile with a file name of "index.md"
			indexFile = node.children.find((child) =>
				["index", "README", "readme"].includes(
					path.parse(child.name).name,
				),
			);
		}

		if (indexFile && indexFile.file) {
			node.file = indexFile.file;
			node.children = node.children.filter(
				(child) => child !== indexFile,
			);
		} else {
			node.file = {
				folderName: node.name,
				absoluteFilePath: path.isAbsolute(node.name)
					? node.name
					: path.join(commonPath, node.name),
				fileName: `${node.name}.md`,
				contents: folderFile as JSONDocNode,
				pageTitle: node.name,
				frontmatter: {},
				tags: [],
				pageId: undefined,
				dontChangeParentPageId: false,
				contentType: "page",
				blogPostDate: undefined,
				sortOrder: 100000,
			};
		}
	}

	let childCommonPath = node?.file?.absoluteFilePath ?? commonPath;
	if (fs.statSync(childCommonPath).isFile())
		childCommonPath = path.dirname(childCommonPath);

	node.children.forEach((childNode) =>
		processNode(childCommonPath, childNode),
	);
};

export const createFolderStructure = (
	markdownFiles: MarkdownFile[],
	settings: ConfluenceSettings,
): LocalAdfFileTreeNode => {
	const commonPath = findCommonPath(
		markdownFiles.map((file) => file.absoluteFilePath),
	);
	const rootNode = createTreeNode(commonPath);

	markdownFiles.forEach((file) => {
		const relativePath = path.relative(commonPath, file.absoluteFilePath);
		addFileToTree(rootNode, file, relativePath, settings);
	});

	processNode(commonPath, rootNode);

	checkUniquePageTitle(rootNode);

	return rootNode;
};

function checkUniquePageTitle(
	rootNode: LocalAdfFileTreeNode,
	pageTitles: Set<string> = new Set<string>(),
) {
	const currentPageTitle = rootNode.file?.pageTitle ?? "";

	if (pageTitles.has(currentPageTitle)) {
		throw new Error(
			`Page title "${currentPageTitle}" is not unique across all files.`,
		);
	}
	pageTitles.add(currentPageTitle);
	rootNode.children.forEach((child) =>
		checkUniquePageTitle(child, pageTitles),
	);
}

function sortFiles(
	file: LocalAdfFile | undefined,
	file1: LocalAdfFile | undefined,
): number {
	const defaultSortOrder = 100000;
	let sortCmp =
		(file?.sortOrder ?? defaultSortOrder) -
		(file1?.sortOrder ?? defaultSortOrder);
	if (sortCmp == 0) {
		sortCmp =
			(file?.fileName ?? file?.folderName)?.localeCompare(
				file1?.fileName ?? file1?.folderName ?? "ZZZZZZ",
			) ?? defaultSortOrder;
	}
	return sortCmp;
}
