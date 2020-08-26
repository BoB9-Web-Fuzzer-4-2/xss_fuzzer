const {
	Worker, MessageChannel, MessagePort, isMainThread, parentPort
} = require('worker_threads');
const axios = require("axios");
const querystring = require("querystring");

parentPort.on("message", async ({port, url, query, post, cookie, finish}) => {
	let response;
	if (Object.values(post).length) { //post
		response = await axios.post(`${url}?${query}`, post, {
			headers: {
				"cookie": cookie
			}
		});
	} else {
		response = await axios.get(`${url}?${query}`, {
			headers: {
				"cookie": cookie
			}
		});
	}
	port.postMessage({
		status: response.status,
		statusText: response.statusText,
		data: response.data,
		finish: finish
	});
});
