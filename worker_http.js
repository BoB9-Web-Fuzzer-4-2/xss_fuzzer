const {
	Worker, MessageChannel, MessagePort, isMainThread, parentPort
} = require('worker_threads');
const axios = require("axios");
const querystring = require("querystring");

parentPort.on("message", async ({port, host, url, query, post, cookie, finish}) => {
	//console.log(`${host}${url}?${query}`, post);
	let response;
	if (Object.values(post).length) { //post
		response = await axios.post(`${host}${url}?${query}`, post, {
			headers: {
				"cookie": cookie
			}
		});
	} else {
		response = await axios.get(`${host}${url}?${query}`, {
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
