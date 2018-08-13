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
const X509WalletMixin = require('../impl/wallet/x509walletmixin');

class BaseWallet {

	constructor(keyValStoreClass, mixin) {
		this.storesInitialized = false;
		this.keyValStoreClass = keyValStoreClass;
		if (!mixin) {
			this.keyWalletMixin = new X509WalletMixin();
		}
	}

	setWalletMixin(walletMixin) {
		//TODO: perform some validation
		this.keyWalletMixin = walletMixin;
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
		if (!client) {
			client = new Client();
		}

		const store = await this.getStateStore(label);
		client.setStateStore(store);

		let cryptoSuite;
		if (this.keyWalletMixin && this.keyWalletMixin.getCryptoSuite) {
			cryptoSuite = await this.keyWalletMixin.getCryptoSuite(label, this.KeyValStoreClass);
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

	async setupStateStore(label) {
		throw new Error('Unimplemented');
	}

	async getCryptoSuite(label) {
		throw new Error('Unimplemented');
	}


	//=========================================================
	// End user APIs
	//=========================================================

	async import(label, identity) {

		// this changes the user context of the client
		label = this.normalizeLabel(label);
		const client = await this.configureClientStores(null, label);
		if (this.keyWalletMixin && this.keyWalletMixin.importIdentity) {
			return await this.keyWalletMixin.importIdentity(client, label, identity);
		} else {
			throw new Error('no cryptocontent method exists');
		}
	}

	async export(label) {

		// TODO: Do we need export? The only reason we needed it for composer was the auto enrollment capability where we
		// had loaded a user directly into the stores. Here we aren't allowing that.
		label = this.normalizeLabel(label);
		const client = await this.configureClientStores(null, label);
		if (this.keyWalletMixin && this.keyWalletMixin.exportIdentity) {
			return await this.keyWalletMixin.exportIdentity(client, label);
		} else {
			throw new Error('no export cryptoContnet exists');
		}
	}

	async update(label, identity) {
		if (await this.exists(label)) {
			await this.delete(label);
			await this.import(label, identity);
		} else {
			throw new Error('identity does not exist');
		}
	}

	// These are specific to the persistence implementation as the key/value stores
	// don't provide any support for this
	normalizeLabel(label) {
		// this is unlikely to be a sensible value to return.
		return label;
	}

	async delete(label) {
		throw new Error('Unimplemented');
	}

	async exists(label) {
		throw new Error('Unimplemented');
	}

	async list(hint = null) {
		throw new Error('Unimplemented');
	}

}

module.exports = BaseWallet;

