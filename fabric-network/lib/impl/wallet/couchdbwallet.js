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
const CouchDBKVStore = require('fabric-client/lib/impl/CouchDBKeyValueStore');
const Wallet = require('../../api/wallet');
const Nano = require('nano');

class CouchDBWallet extends Wallet {


	// TODO: assumption
	// {url: 'http://localhost:5984'}
	constructor(options) {
		super();
		this.options = options;
		this.couch = Nano(options.url);
		this.dbOptions = {};
		Object.assign(this.dbOptions, this.options);
	}

	_createOptions(label) {
		let dbOptions = {};
		Object.assign(dbOptions, this.options);
		dbOptions.name = 'identity_' + label;
		return dbOptions;
	}

	async setupStateStore(label) {
		const store = await new CouchDBKVStore(this._createOptions(label));
		this.client.setStateStore(store);
	}

	setupKeyStore(label) {
		const cryptoSuite = Client.newCryptoSuite();
		cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore(CouchDBKVStore, this._createOptions(label)));
		this.client.setCryptoSuite(cryptoSuite);
	}

	async update(label, certificate, privateKey = null) {
		throw new Error('Unimplemented');
	}

	async delete(label) {
		throw new Error('Unimplemented');

	}

	async exists(label) {
		const name = 'identity_' + label;
		return new Promise((resolve, reject) => {
			this.couch.db.get(name, (err) => {
				if (err === null) {
					resolve(true);
				}
				resolve(false);
			});
		});
	}

	async list(hint = null) {
		//TODO: we could manage
		throw new Error('Unimplemented');
	}
}

module.exports = CouchDBWallet;
