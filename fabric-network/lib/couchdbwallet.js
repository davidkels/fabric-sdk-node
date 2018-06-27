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
const Wallet = require('./wallet');
const Nano = require('nano');


//TODO: Push to the super class most of this, initialize creates a KeyValStore proxy used by superclass
//TODO: How to augment HSM into any Wallet implementation
class CouchDBWallet extends Wallet {

    static normalizeLabel(label) {
        //TODO:
        return label;
    }


    // TODO: assumption
    // {url: 'http://localhost:5984'}
    constructor(options) {
        super();
        this.options = options;
        this.couch = Nano(options.url);
    }

    setClient(client) {
        this.client = client;
    }


    async _setupStores(label) {
        if (!this.client) {
            this.client = new Client();
        }

        let dbOptions = {};
        Object.assign(dbOptions, this.options);
        dbOptions.name = 'identity_' + label;

        const store = await new CouchDBKVStore(dbOptions);
        this.client.setStateStore(store);
        const cryptoSuite = Client.newCryptoSuite();
        cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore(CouchDBKVStore, dbOptions));
        this.client.setCryptoSuite(cryptoSuite);
    }

    async import(label, mspId, certificate, privateKey) {
        label = CouchDBWallet.normalizeLabel(label);
        await this._setupStores(label);
        await super.import(label, mspId, certificate, privateKey);
    }

    async update(label, certificate, privateKey = null) {
        label = CouchDBWallet.normalizeLabel(label);
        await this._setupStores(label);

        throw new Error('Unimplemented');
    }
    
    async delete(label) {
        label = CouchDBWallet.normalizeLabel(label);
        await this._setupStores(label);
        throw new Error('Unimplemented');

    }

    async export(label) {
        label = CouchDBWallet.normalizeLabel(label);
        return super.export(label);
    }

    async exists(label) {
        const name = 'identity_' + label;
        return new Promise((resolve, reject) => {
            this.couch.db.get(name, (err) => {
                if (err === null) {
                    resolve(true);
                }
                resolve(false);
            })
        });
    }

    async list(hint = null) {
        //TODO: we could manage
        throw new Error('Unimplemented');
    }

    async setUserContext(label) {
        label = CouchDBWallet.normalizeLabel(label);
        await this._setupStores(label);
        return super.setUserContext(label);
    }

}

module.exports = CouchDBWallet;