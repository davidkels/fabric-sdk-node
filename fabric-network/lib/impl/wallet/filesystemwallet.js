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
const fs = require('fs-extra');
const Path = require('path');
const BaseWallet = require('./basewallet');
const FileKVS = require('fabric-client/lib/impl/FileKeyValueStore');

class FileSystemWallet extends BaseWallet {


	// TODO: assumption
	constructor(path) {
		super();
		this.path = path;
	}

	_getPartitionedPath(label) {
		label = this.normalizeLabel(label);
		const partitionedPath = Path.join(this.path, label);
		return partitionedPath;
	}

	async getStateStore(label) {
		const partitionedPath = this._getPartitionedPath(label);
		const store = await new FileKVS({path: partitionedPath});
		return store;
	}

	async getCryptoSuite(label) {
		const partitionedPath = this._getPartitionedPath(label);
		const cryptoSuite = Client.newCryptoSuite();
		cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: partitionedPath}));
		return cryptoSuite;
	}

	async getAllLabels() {
		const fileList = await fs.readdir(this.path);
		if (fileList && fileList.length > 0) {
			const dirList = fileList.filter(async (file) => {
				return await fs.lstat(Path.join(this.path, file)).isDirectory();
			});
			return dirList;
		}
		return null;
	}

	async delete(label) {
		const partitionedPath = this._getPartitionedPath(label);
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
		const partitionedPath = this._getPartitionedPath(label);
		const exists = await fs.exists(partitionedPath);
		return exists;
	}
}

module.exports = FileSystemWallet;
