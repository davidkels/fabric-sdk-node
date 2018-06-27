'use strict';

const Network = require('../lib/network');
const FileSystemWallet = require('../lib/filesystemwallet');
//const CouchDBWallet = require('../lib/couchdbwallet');
const uuid = require('uuid');

const fs = require('fs');


(async () => {
	// Perform some identity management first
	const wallet = new FileSystemWallet('/home/vagrant/.wallet');
	//const wallet = new CouchDBWallet({url: 'http://localhost:5984'});
	const exists = await wallet.exists('dave');
	if (!exists) {
		const cert = fs.readFileSync('./e2e/dave/cert.pem').toString();
		const key = fs.readFileSync('./e2e/dave/key.pem').toString();
		await wallet.import('dave', 'Org1MSP', cert, key);
	}

	// now we are ready to interact with the network
	const network = new Network();
	// maybe network could also read the file directly
	const buffer = fs.readFileSync('./e2e/ccp.json');

	try {
		//TODO: should an app provide a wallet implementation or a URI string which represents an implementation to be
		// loaded by the network class.
		await network.initialize(JSON.parse(buffer.toString()), {
			wallet: wallet,
			identity: 'dave'
		});


		try {
			let response = await network.submitTransaction('composerchannel', 'demo', '', ['key1', 'key2', 50]);
			console.log('got response: ' + response);
		} catch(error) {
			console.log('got error', error);
		}
	} catch(error) {
		console.log(error);
	} finally {
		console.log('disconnecting');
		network.disconnect();
	}


})();

