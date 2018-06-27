/*
 Copyright 2018 IBM All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

		http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/
'use strict';

const Client = require('fabric-client');
const rimraf = require('rimraf');
const fs = require('fs');
const Path = require('path');
const Wallet = require('../../api/wallet');

class FileSystemWallet extends Wallet {


	// TODO: assumption
	constructor(path) {
		super();
		this.path = path;
	}

	async setupStateStore(client, label) {
		const partitionedPath = Path.join(this.path, label);
		const store = await Client.newDefaultKeyValueStore({path: partitionedPath});
		client.setStateStore(store);
	}

	setupKeyStore(client, label) {
		const partitionedPath = Path.join(this.path, label);
		const cryptoSuite = Client.newCryptoSuite();
		cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: partitionedPath}));
		client.setCryptoSuite(cryptoSuite);
	}

	async delete(label) {
		label = FileSystemWallet.normalizeLabel(label);
		const partitionedPath = Path.join(this.path, label);
		return new Promise((resolve, reject) => {
			rimraf(partitionedPath, (err) => {
				if (err) {
					reject(err);
				}
				resolve();
			});
		});
	}

	async exists(label) {
		const partitionedPath = Path.join(this.path, label, label);
		const exists = fs.existsSync(partitionedPath);
		return exists;
	}

	async list(hint = null) {
		//TODO: we could manage
		throw new Error('Unimplemented');
	}
}

module.exports = FileSystemWallet;
