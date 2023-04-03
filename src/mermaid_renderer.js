import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false });

window.renderMermaidChart = async (chartData) => {
	return new Promise(async (resolve) => {
		console.log({ chartData });
		const { svg } = await mermaid.render("graphDiv2", chartData);
		console.log({ svg });

		const chartElement = document.querySelector("#graphDiv");
		chartElement.innerHTML = svg;

		resolve({
			x: 0,
			y: 0,
			width: chartElement.clientWidth,
			height: chartElement.clientHeight,
		});
	});
};