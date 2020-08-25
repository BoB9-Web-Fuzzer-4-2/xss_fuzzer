const querystring = require("querystring");
const axios = require("axios");

let seed_path = "", target_url = "", query = {}, post = {}, cookie = "";

process.argv.forEach(v => {
	if (v.startsWith("seed=")) seed_path = v.substr("seed=".length);
	if (v.startsWith("url=")) target_url = v.substr("url=".length);
	if (v.startsWith("cookie=")) cookie = v.substr("cookie=".length);
	if (v.startsWith("query=")) query = querystring.parse(v.substr("query=".length));
	if (v.startsWith("post=")) post = querystring.parse(v.substr("post=".length));
});

const validURL = str => !!(new RegExp('^(https?:\\/\\/)?' + // protocol
	'((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
	'((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
	'(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
	'(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
	'(\\#[-a-z\\d_]*)?$', 'i').test(str));

const clone = obj => JSON.parse(JSON.stringify(obj));

const fs = require("fs");

if ((query === {} && post === {}) || !validURL(target_url) || !fs.existsSync(seed_path)) {
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

let xss_param = fs.readFileSync(seed_path, "utf-8").split("\n").filter(v => v !== "");

(async () => {
	global.driver = await new Builder().forBrowser('chrome').build();

	console.log(`START FUZZING`);
	console.log(`===============================================================================`);

	let start = Date.now(), response_list = [];
	for (let attack_vec of xss_param) {
		let attack_param = clone(query), attack_post = clone(post);

		for (let k of Object.keys(attack_param))
			if (attack_param[k] === "{FUZZ}") attack_param[k] = attack_vec;
		for (let k of Object.keys(attack_post))
			if (attack_post[k] === "{FUZZ}") attack_post[k] = attack_vec;

		response_list.push(new Promise(async (r) => {
			let response;
			if (Object.values(attack_post).length) { //post
				response = await axios.post(`${target_url}?${querystring.encode(attack_param)}`, attack_post, {
					headers: {
						"cookie": cookie
					}
				});
			} else {
				response = await axios.get(`${target_url}?${querystring.encode(attack_param)}`, {
					headers: {
						"cookie": cookie
					}
				});
			}
			r({response: response, attack_param: attack_param, attack_post: attack_post});
		}));
	}

	Promise.all(response_list).then(async (list) => {
		for (let obj of list) {
			let html = `
<script>
location.reload = location.replace = alert = confirm = () => {};
window.testSuccess = false;
window.executeTest = () => testSuccess = true;
</script>
${obj.response.data}`;
			await driver.get(`data:text/html;charset=utf-8,${html}`);

			let success = await driver.executeScript(() => testSuccess);
			console.log(`${obj.response.status} ${obj.response.statusText}\t\t${success ? "SUCCESS" : "FAIL"}\t\t${querystring.encode(obj.attack_param)}\t\t${querystring.encode(obj.attack_post)}`);
		}

		let diff = Date.now() - start;
		console.log(`time: ${diff}ms`);
		exit(0);
	});
})();
