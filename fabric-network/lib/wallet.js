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


//TODO: Push to the super class most of this, initialize creates a KeyValStore proxy used by superclass
//TODO: How to augment HSM into any Wallet implementation
class Wallet  {

    setClient(client) {
        this.client = client;
    }


    async _setupStores(label) {
    }

    async import(label, mspId, certificate, privateKey) {
        //TODO: Push to superclass

        const cryptoContent = {
            signedCertPEM: certificate,
            privateKeyPEM: privateKey
        };
    
        await this.client.createUser(
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

    async export(label) {

        // TODO: push down into the node sdk itself, eg exportUser.
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
        throw new Error('Unimplemented');
    }

    async exists(label) {
        throw new Error('Unimplemented');
    }

    async list(hint = null) {
        throw new Error('Unimplemented');
    }

    async setUserContext(label) {
        const loadedIdentity = await this.client.getUserContext(label, true);
        if (!loadedIdentity || !loadedIdentity.isEnrolled()) {
            throw new Error('identity isn\'t enrolled, or loaded');
        }
        return loadedIdentity;
    }

}

module.exports = Wallet;