const querystring = require("querystring");
const axios = require("axios");
const {
	Worker, MessageChannel, MessagePort, isMainThread, parentPort
} = require('worker_threads');

let attack_seed = "", url_seed = "", host = "", cookie = "";

process.argv.forEach(v => {
	if (v.startsWith("attack_seed=")) attack_seed = v.substr("attack_seed=".length);
	if (v.startsWith("url_seed=")) url_seed = v.substr("url_seed=".length);
	if (v.startsWith("cookie=")) cookie = v.substr("cookie=".length);
	if (v.startsWith("host=")) host = v.substr("host=".length);
});

const validURL = str => !!(new RegExp('^(https?:\\/\\/)?' + // protocol
	'((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
	'((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
	'(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
	'(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
	'(\\#[-a-z\\d_]*)?$', 'i').test(str));

const clone = obj => JSON.parse(JSON.stringify(obj));

const fs = require("fs");

if (!validURL(host) || !fs.existsSync(attack_seed) || !fs.existsSync(url_seed)) {
	console.log(`node xss_fuzzer.js seed=path/seed.txt url=URL query=Query post=POST_DATA cookie=cookie;`);
	process.exit(0);
}

require("chromedriver");
const {Builder, By, Key, until} = require('selenium-webdriver');

const exit = async (code) => {
	await driver.session_.then(() => driver.quit()).catch(() => {
	});
	process.exit(code);
};

let response_list = [], req_list = [];

const toWorker = (worker, url, attack_param, attack_post, finish, resolve) => {
	let subchannel = new MessageChannel();
	worker.postMessage({
		port: subchannel.port1,
		host: host,
		url: url,
		query: querystring.encode(attack_param),
		post: querystring.encode(attack_post),
		cookie: cookie,
		finish: finish
	}, [subchannel.port1]);
	subchannel.port2.on("message", res => {
		response_list.push({
			response: res,
			url: url,
			attack_param: attack_param,
			attack_post: attack_post
		});

		if (res.finish) resolve();
		if (!req_list.length) return;
		let new_push = req_list.pop();
		toWorker(
			worker,
			new_push.url,
			new_push.attack_param,
			new_push.attack_post,
			!req_list.length,
			resolve
		);
	});
};

let xss_param = fs.readFileSync(attack_seed, "utf-8").split("\n").filter(v => v !== "");

(async () => {
	let load_driver = [global.driver = new Builder().forBrowser('chrome').build()];



	console.log(`START FUZZING`);
	console.log(`===============================================================================`);

	let start = Date.now();

	await new Promise(r => {
		let urls = fs.readFileSync(url_seed, "utf-8").split("\r\n");
		for (let i = 0; i < urls.length; i++) {
			if (urls[i].trim() === "") continue;
			let method = urls[i].split(" ")[0], url = urls[i].split(" ")[1], query = {}, post = {};
			console.log( urls[i].split(" "))
			query = querystring.decode(url.split("?").slice(1).join("?"));
			url = url.split("?")[0];
			if (method === "POST") {
				post = querystring.decode(urls[++i]);
			}
			for (let attack_vec of xss_param) {
				let attack_param = clone(query), attack_post = clone(post);

				for (let k of Object.keys(attack_param))
					if (attack_param[k] === "{FUZZ}") attack_param[k] = attack_vec;
				for (let k of Object.keys(attack_post))
					if (attack_post[k] === "{FUZZ}") attack_post[k] = attack_vec;

				req_list.push({
					url: url,
					attack_param: attack_param,
					attack_post: attack_post
				});
			}
		}


		let worker = new Worker("./worker.js");
		for (let i = 0; i < 12 && req_list.length; i++) {
			let req = req_list.pop();
			toWorker(worker, req.url, req.attack_param, req.attack_post, false, r);
		}
	});

	await Promise.all(load_driver);

	console.log(`HTTP REQ time: ${Date.now() - start}ms`);
	for (let obj of response_list) {
		let html = `
<script>
location.reload = location.replace = alert = confirm = () => {};
window.testSuccess = false;
window.executeTest = () => testSuccess = true;
</script>
${obj.response.data}`;
		await driver.get(`data:text/html;charset=utf-8,${html}`);

		let success = await driver.executeScript(() => testSuccess);
		console.log(`${obj.response.status} ${obj.response.statusText}\t\t${obj.url}\t\t${success ? "SUCCESS" : "FAIL"}\t\t${querystring.encode(obj.attack_param)}\t\t${querystring.encode(obj.attack_post)}`);
	}

	console.log(`time: ${Date.now() - start}ms`);
	exit(0);
})();
