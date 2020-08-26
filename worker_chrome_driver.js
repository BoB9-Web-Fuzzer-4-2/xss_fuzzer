const {
	Worker, MessageChannel, MessagePort, isMainThread, parentPort
} = require('worker_threads');
const querystring = require("querystring");

require("chromedriver");
const {Builder, By, Key, until} = require('selenium-webdriver');

let driver;

parentPort.on("message", async ({port, creation_driver, quit, obj}) => {
	if (creation_driver) {
		driver = await new Builder().forBrowser('chrome').build();
		port.postMessage({});
		return;
	}
	if (quit) {
		await driver.quit();
		port.postMessage({});
		return;
	}
	obj = JSON.parse(obj);
	let html = `
<script>
location.reload = location.replace = alert = confirm = () => {};
window.testSuccess = false;
window.executeTest = () => testSuccess = true;
</script>
${obj.response.data}`;
	await driver.get(`data:text/html;charset=utf-8,${html}`);

	let success = await driver.executeScript(() => testSuccess);
	console.log(`${obj.response.status} ${obj.response.statusText}\t\t\t${obj.url}\t\t\t${success ? "SUCCESS" : "FAIL"}\t\t\t${querystring.encode(obj.attack_param)}\t\t\t${querystring.encode(obj.attack_post)}`);

	port.postMessage({});
});
