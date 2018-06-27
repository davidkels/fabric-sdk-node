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

//const Wallet = require('./walletmanager');
const Client = require('fabric-client');
const rimraf = require('rimraf');
const fs = require('fs');
const Path = require('path');


//TODO: Push to the super class most of this, initialize creates a KeyValStore proxy used by superclass
//TODO: How to augment HSM into any Wallet implementation
class FileSystemWallet /*extends Wallet*/ {

    static normalizeLabel(label) {
        //TODO:
        return label;
    }


    // TODO: assumption
    constructor(path) {
        this.path = path;
    }

    setClient(client) {
        this.client = client;
    }


    async _setupStores(label) {
        if (!this.client) {
            this.client = new Client();
        }

        const partitionedPath = Path.join(this.path, label);
        const store = await Client.newDefaultKeyValueStore({path: partitionedPath});
        this.client.setStateStore(store);
        const cryptoSuite = Client.newCryptoSuite();
        cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: partitionedPath}));
        this.client.setCryptoSuite(cryptoSuite);
    }

    async import(label, mspId, certificate, privateKey) {
        console.log('Calling import!!!');
        label = FileSystemWallet.normalizeLabel(label);
        
        await this._setupStores(label);

        //TODO: Push to superclass

        const cryptoContent = {
            signedCertPEM: certificate,
            privateKeyPEM: privateKey
        };
    
        //console.log(this.client);
        await this.client.createUser(
            {
                username: label,
                mspid: mspId,
                cryptoContent: cryptoContent
            });        
    }

    async update(label, certificate, privateKey = null) {
        label = FileSystemWallet.normalizeLabel(label);
        await this._setupStores(label);

        throw new Error('Unimplemented');
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
            })
        });
    }

    async export(label) {
        label = FileSystemWallet.normalizeLabel(label);

        // TODO: push down into the node sdk itself, eg exportUser. Then put call of it to superclass;
        // Do we need export? The only reason we needed it for composer was the auto enrollment capability where we
        // had loaded a user directly into the stores. Here we aren't allowing that.
        // TODO: Should a network class exist above both the fabric-client and fabric-ca-client ?
        const user = await this.client.getUserContext(id, true);  // dangerous as it changes the client user context
        let result = null;
        if (user) {
            result = {
                certificate: user.getIdentity()._certificate,
                privateKey: user.getSigningIdentity()._signer._key.toBytes()
            };
        }        
    }

    async exists(label) {
        const partitionedPath = Path.join(this.path, label, label);
        return fs.existsSync(partitionedPath);
    }

    async list(hint = null) {
        //TODO: we could manage
        throw new Error('Unimplemented');
    }

    async setUserContext(label) {
        label = FileSystemWallet.normalizeLabel(label);
        await this._setupStores(label);

        const loadedIdentity = await this.client.getUserContext(label, true);
        if (!loadedIdentity || !loadedIdentity.isEnrolled()) {
            throw new Error('identity isn\'t enrolled, or loaded');
        }
        return loadedIdentity;
    }

}

module.exports = FileSystemWallet;