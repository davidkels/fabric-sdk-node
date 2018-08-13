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

class WalletMixin  {

	// Implementing this is optional if a mixin wants to handle
	// the management of the keystore
	//getCryptoSuite(label, keyValStoreClass) {
	//}

	async importIdentity(client, identity) {
		// has to be implemented
		throw new Error('not implemented');
	}

	async exportIdentity(client, label) {
		// has to be implemented
		throw new Error('not implemented');
	}
}

module.exports = WalletMixin;
