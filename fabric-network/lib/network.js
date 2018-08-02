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
const Channel = require('./channel');
const DefaultEventStrategies = require('./impl/event/defaulteventstrategies');
const logger = require('./logger').getLogger('Network');


class Network {

	static _mergeOptions(defaultOptions, suppliedOptions) {
		for (const prop in suppliedOptions) {
			if (suppliedOptions[prop] instanceof Object && prop.endsWith('Options')) {
				if (defaultOptions[prop] === undefined) {
					defaultOptions[prop] = suppliedOptions[prop];
				} else {
					Network._mergeOptions(defaultOptions[prop], suppliedOptions[prop]);
				}
			} else {
				defaultOptions[prop] = suppliedOptions[prop];
			}
		}
	}

	constructor() {
		logger.debug('in Network constructor');
		this.client = null;
		this.wallet = null;
		this.channels = new Map();

		// default options
		this.options = {
			commitTimeout: 300 * 1000,
			eventHandlerFactory: './impl/event/defaulteventhandlerfactory',
			eventHandlerOptions: {
				strategy: DefaultEventStrategies.MSPID_SCOPE_ALLFORTX,
				timeout: 60
			},
			queryHandler: './impl/query/defaultqueryhandler',
			queryHandlerOptions: {
			},
			// TODO: discovery-cache-age (only used by getDiscoveryResults)
			// TODO: expose refresh.
			// TODO: We need a timeout when submitTransaction is called to determine if a refresh should
			// be made.
			useDiscovery: false,
			discoveryOptions: {
				// These are the defaults set by the node-sdk, can use env vars
				// or programmatically specify through the options.
				// discoveryProtocol: 'grpcs',
				// asLocalhost: false
				// discoveryRefresh: 300000 (TODO: on a timeout or only when submit is done ?)
			}
		};
	}

	/**
	 * initialize the network with a connection profile (either for static purposes or for initial discovery info)
	 *
	 * @param {*} ccp
	 * @param {*} options
	 * @memberof Network
	 */
	async initialize(ccp, options) {
		if (!options || !options.wallet) {
			throw new Error('A wallet must be assigned to a Network instance');
		}

		// if the default handlers have been changed, delete the default options before merging.
		if (options.eventHandlerFactory && this.options.eventHandlerFactory !== options.eventHandlerFactory) {
			console.log('deleting event handler options');
			delete this.options.eventHandlerOptions;
		}
		if (options.queryHandler && this.options.queryHandler !== options.queryHandlerFactory) {
			delete this.options.queryHandlerOptions;
		}

		Network._mergeOptions(this.options, options);


		if (this.options.eventHandlerFactory) {
			try {
				this.eventHandlerFactoryClass = require(this.options.eventHandlerFactory);
			} catch(error) {
				console.log(error);
				throw new Error('unable to load provided event handler factory: ' + this.options.eventHandlerFactory);
			}
		}

		try {
			this.queryHandlerClass = require(this.options.queryHandler);
		} catch(error) {
			console.log(error);
			throw new Error('unable to load provided query handler: ' + this.options.queryHandler);
		}

		// These are global to the app, but would assume you won't want a mixture of discover and non discover
		if (this.options.useDiscovery && this.options.discoveryOptions && this.options.discoveryOptions.discoveryProtocol) {
			Client.setConfigSetting('discovery-protocol', this.options.discoveryOptions.discoveryProtocol);
		}

		if (!(ccp instanceof Client)) {
			// still use a ccp for the discovery peer and ca information
			this.client = Client.loadFromConfig(ccp);
		}

		// setup an initial identity for the network
		if (options.identity) {
			this.currentIdentity = await options.wallet.setUserContext(this.client, options.identity);
		}
	}

	/**
	 * Allows you to set the identity after network initialization, may remove.
	 *
	 * @param {*} newIdentity
	 * @memberof Network
	 */
	async setIdentity(newIdentity) {
		//TODO: what to do if mspId changes ? all contracts are not useable as the default query peers and maybe the event
		// hubs are tied to a specific mspId. What happens if users write their own handlers ?
		// What happens if you are in the middle of interacting with a contract ?
		// also what if you are using ABAC and swap identities ? even if the mspId doesn't change.
		// Think this all boils down to the fact you cannot switch identities, you can only set it once
		if (this.currentIdentity) {
			throw new Error('The identity for this network has already been set. It cannot be changed');
		}
		this.currentIdentity = await this.options.wallet.setUserContext(this.client, newIdentity);
	}

	/**
	 * get the current identity
	 *
	 * @returns
	 * @memberof Network
	 */
	getCurrentIdentity() {
		return this.currentIdentity;
	}

	/**
	 * get the underlying client instance
	 *
	 * @returns
	 * @memberof Network
	 */
	getClient() {
		return this.client;
	}


	getOptions() {
		return this.options;
	}

	async _createEventHandlerFactory(channel, peerMap) {

		if (this.eventHandlerFactoryClass) {
			// TODO: Should not use private var of User object (_mspId)
			const currentmspId = this.getCurrentIdentity()._mspId;
			const eventHandlerFactory = new this.eventHandlerFactoryClass(
				channel,
				currentmspId,
				peerMap,
				this.options.eventHandlerOptions
			);
			await eventHandlerFactory.initialize();
			return eventHandlerFactory;
		}
		return null;
	}

	async _createQueryHandler(channel, peerMap) {
		if (this.queryHandlerClass) {
			const currentmspId = this.getCurrentIdentity()._mspId;
			const queryHandler = new this.queryHandlerClass(
				channel,
				currentmspId,
				peerMap,
				this.options.queryHandlerOptions
			);
			await queryHandler.initialize();
			return queryHandler;
		}
		return null;
	}

	/**
	 * clean up this network in prep for it to be discarded and garbage collected
	 *
	 * @memberof Network
	 */
	cleanup() {
		for (const channel of this.channels.values()) {
			channel.cleanup();
		}
		this.channels.clear();
	}

	async getChannel(channelName) {
		const existingChannel = this.channels.get(channelName);
		if (!existingChannel) {
			const channel = this.client.getChannel(channelName);
			const newChannel = new Channel(this, channel);
			await newChannel.initialize();
			this.channels.set(channelName, newChannel);
			return newChannel;
		}
		return existingChannel;
	}
}


module.exports = Network;
