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
const X509WalletMixin = require('./x509walletmixin');
const Wallet = require('../../api/wallet');

class BaseWallet extends Wallet {

	constructor(walletMixin = new X509WalletMixin()) {
		super();
		this.storesInitialized = false;
		this.walletMixin = walletMixin;
	}

	setWalletMixin(walletMixin) {
		//TODO: perform some validation
		this.walletMixin = walletMixin;
	}


	// ===============================================
	// SPI Methods
	// ===============================================

	/**
	 * End users of a wallet don't make use of this method, this method is for use by the
	 * fabric-network implementation
	 *
	 * @param {*} client
	 * @param {*} label
	 * @returns
	 * @memberof Wallet
	 */
	async setUserContext(client, label) {
		label = this.normalizeLabel(label);

		//TODO: We could check the client to see if the context matches what we would load ?
		//Although this may be complex to do, maybe we could cache the previous label and
		//Another setUserContext call can be bypassed.
		await this.configureClientStores(client, label);
		const loadedIdentity = await client.getUserContext(label, true);
		if (!loadedIdentity || !loadedIdentity.isEnrolled()) {
			throw new Error('identity isn\'t enrolled, or loaded');
		}
		return loadedIdentity;
	}

	async configureClientStores(client, label) {
		label = this.normalizeLabel(label);
		if (!client) {
			client = new Client();
		}

		const store = await this.getStateStore(label);
		client.setStateStore(store);

		let cryptoSuite;
		if (this.walletMixin && this.walletMixin.getCryptoSuite) {
			cryptoSuite = await this.walletMixin.getCryptoSuite(label, this);
		}

		if (!cryptoSuite) {
			cryptoSuite = await this.getCryptoSuite(label);
		}
		client.setCryptoSuite(cryptoSuite);
		return client;
	}

	//========================================
	// The following 2 apis are implemented to
	// provide the persistence mechanism
	// a mixin can override the getCryptoSuite
	//========================================

	async getStateStore(label) {
		throw new Error('Unimplemented');
	}

	async getCryptoSuite(label) {
		throw new Error('Unimplemented');
	}

	// if this is overridden, then it has to be bi-directional
	// for the list to work properly.
	normalizeLabel(label) {
		return label;
	}

	//=========================================================
	// End user APIs
	//=========================================================

	//=========================================================
	// Mixins provide support for import & export
	//=========================================================

	async import(label, identity) {
		label = this.normalizeLabel(label);
		const client = await this.configureClientStores(null, label);
		if (this.walletMixin && this.walletMixin.importIdentity) {
			return await this.walletMixin.importIdentity(client, label, identity);
		} else {
			throw new Error('no import method exists');
		}
	}

	async export(label) {
		label = this.normalizeLabel(label);
		const client = await this.configureClientStores(null, label);
		if (this.walletMixin && this.walletMixin.exportIdentity) {
			return await this.walletMixin.exportIdentity(client, label);
		} else {
			throw new Error('no export method exists');
		}
	}

	//=========================================================
	// Wallets combined with mixins provide support for list
	//=========================================================

	async list() {
		const idInfoList = [];
		const labelList = await this.getAllLabels();  // these need to be denormalised
		if (labelList && labelList.length > 0 && this.walletMixin && this.walletMixin.getIdentityInfo) {
			for (const label of labelList) {
				const client = await this.configureClientStores(null, label);
				const idInfo = await this.walletMixin.getIdentityInfo(client, label);
				if (idInfo) {
					idInfoList.push(idInfo);
				}
				else {
					idInfoList.push({
						label,
						mspId: 'not provided',
						identifier: 'not provided'
					});
				}
			}
		}
		return idInfoList;
	}

	async getAllLabels() {
		return null;
	}

	//=========================================================
	// Wallets provide support for delete and exists
	//=========================================================


	async delete(label) {
		throw new Error('Unimplemented');
	}

	async exists(label) {
		throw new Error('Unimplemented');
	}

	//TODO: FUTURE: Need some sort of api for a mixin to call to be able to integrate correctly
	//with the specific persistence mechanism if it wants to use the same persistence
	//feature
}

module.exports = BaseWallet;

