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

class Wallet  {

	static createX509Identity(certificate, privateKey) {
		return {
			type: 'X509',
			certificate,
			privateKey
		};
	}

	constructor() {
		this.storesInitialized = false;
		this.KeyWalletMixin = null;
	}

	setKeyWalletMixin(walletMixin) {
		//TODO: perform some validation
		this.keyWalletMixin = walletMixin;
	}

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

		await this.setupStateStore(client, label);
		if (this.keyWalletMixin && this.keyWalletMixin.setupKeyStore) {
			this.keyWalletMixin.setupKeyStore(client, label);
		} else {
			this.setupKeyStore(client, label);
		}
		return client;
	}

	normalizeLabel(label) {
		return label;
	}

	async setupStateStore(client, label) {
		throw new Error('Unimplemented');
	}

	async setupKeyStore(client, label) {
		throw new Error('Unimplemented');
	}

	async _createCryptoContent(certificate, privateKey) {
		if (this.keyWalletMixin && this.keyWalletMixin.createCryptoContent) {
			return await this.keyWalletMixin.createCryptoContent(certificate, privateKey);
		}

		const cryptoContent = {
			signedCertPEM: certificate,
			privateKeyPEM: privateKey
		};

		return cryptoContent;

	}

	async import(label, mspId, certificate, privateKey = null) {

		// this changes the user context of the client
		label = this.normalizeLabel(label);
		const client = await this.configureClientStores(null, label);

		const cryptoContent = await this._createCryptoContent(certificate, privateKey);

		await client.createUser(
			{
				username: label,
				mspid: mspId,
				cryptoContent: cryptoContent
			});
	}

	async update(label, certificate, privateKey = null) {
		throw new Error('Unimplemented');
	}

	async delete(label) {
		throw new Error('Unimplemented');
	}

	_exportCryptoContent(user) {
		if (this.keyWalletMixin && this.keyWalletMixin.exportCryptoContent) {
			return this.keyWalletMixin.exportCryptoContent(user);
		}

		return {
			certificate: user.getIdentity()._certificate,
			privateKey: user.getSigningIdentity()._signer._key.toBytes()
		};
	}

	async export(label) {

		// TODO: Do we need export? The only reason we needed it for composer was the auto enrollment capability where we
		// had loaded a user directly into the stores. Here we aren't allowing that.
		label = this.normalizeLabel(label);
		const client = await this.configureClientStores(null, label);

		const user = await client.getUserContext(label, true);
		let result = null;
		if (user) {
			result = this._exportCryptoContent(user);
		}
		return result;
	}

	async exists(label) {
		throw new Error('Unimplemented');
	}

	async list(hint = null) {
		throw new Error('Unimplemented');
	}

}

module.exports = Wallet;
