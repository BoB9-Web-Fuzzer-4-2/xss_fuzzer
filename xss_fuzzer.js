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
	for (let worker of driver_workers) {
		let channel = new MessageChannel();
		worker.postMessage({port: channel.port1, quit: true}, [channel.port1]);
		await new Promise(r => channel.port2.on("message", () => r()));
	}
	process.exit(code);
};

let response_list = [], req_list = [];

const httpRequestWorker = (worker, url, attack_param, attack_post, finish, resolve) => {
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
		httpRequestWorker(
			worker,
			new_push.url,
			new_push.attack_param,
			new_push.attack_post,
			!req_list.length,
			resolve
		);
	});
};

const xssCheck = async (worker, data_obj, finish, resolve) => {
	let subchannel = new MessageChannel();
	worker.postMessage({
		port: subchannel.port1,
		obj: JSON.stringify(data_obj)
	}, [subchannel.port1]);
	subchannel.port2.on("message", () => {
		if (finish) resolve();
		if (!response_list.length) return;
		let new_push = response_list.pop();
		xssCheck(
			worker,
			new_push,
			!response_list.length,
			resolve
		);
	});
};

const generate_chrome_driver = async() => {
	let ret;
	await new Promise(r => {
		let subchannel = new MessageChannel();
		let worker = new Worker("./worker_chrome_driver.js");
		worker.postMessage({
			port: subchannel.port1,
			creation_driver: true
		}, [subchannel.port1]);
		subchannel.port2.on("message", () => {
			r(ret = worker);
		});
	});
	return ret;
};

let xss_param = fs.readFileSync(attack_seed, "utf-8").split("\n").filter(v => v !== "");

const chrome_driver_cnt = 5;
(async () => {
	global.driver_workers = [];
	let worker_promise = [];
	for (let i = 0; i < chrome_driver_cnt; i++) worker_promise.push(generate_chrome_driver());

	console.log(`START FUZZING`);
	console.log(`===============================================================================`);

	let start = Date.now();

	await new Promise(r => {
		let urls = fs.readFileSync(url_seed, "utf-8").split("\r\n");
		for (let i = 0; i < urls.length; i++) {
			if (urls[i].trim() === "") continue;
			let method = urls[i].split(" ")[0], url = urls[i].split(" ")[1], query = {}, post = {};

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


		let worker = new Worker("./worker_http.js");
		for (let i = 0; i < 60 && req_list.length; i++) {
			let req = req_list.pop();
			httpRequestWorker(worker, req.url, req.attack_param, req.attack_post, false, r);
		}
	});
	console.log(`HTTP REQ time: ${Date.now() - start}ms`);

	await Promise.all(worker_promise).then(workers => workers.forEach(worker => driver_workers.push(worker)));
	await new Promise(r => {
		for (let i = 0; i < chrome_driver_cnt && response_list.length; i++) {
			let pop = response_list.pop();
			xssCheck(driver_workers[i], pop, false, r);
		}
	});

	console.log(`time: ${Date.now() - start}ms`);
	exit(0);
})();
