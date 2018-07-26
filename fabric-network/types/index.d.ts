import {Channel, User, ChannelEventHub, TransactionId} from 'fabric-client';
import { EventEmitter } from 'events';

// workaround as client isn't exported from fabric-client and it should be
type Client = any;

declare namespace FabricNetwork {

	export interface InitOptions {
		commitTimeout?: number;
		eventHandlerFactory?: string;
		eventHandlerOptions?: any;
		queryHandler?: string;
		queryHandlerOptions?: any;
		useDiscovery?: boolean;
		discoveryOptions?: {
			discoveryProtocol: string;
			asLocalHost: boolean;
			discoveryRefresh: number;
		}
	}

	export class Network {
		//TODO: how to we create a network from a client ?
		constructor();
		initialize(ccp: string, options?: InitOptions): Promise<void>;
		rediscover(channelName: string): Promise<void>;
		setIdentity(newIdentity: string): Promise<void>;
		getCurrentIdentity(): User;
		getClient(): Client;
		// TODO: do we want to maybe map these to mspid, also no guarantee they are connected.
		getEventHubs(): ChannelEventHub[];
		cleanup(): Promise<void>;
		getContract(channelName: string, chaincodeId: string): Promise<Contract>;
	}

	export class Contract extends EventEmitter {
		query(transactionName: string, parameters: string[], txId?: TransactionId): Promise<Buffer>;
		submitTransaction(transactionName: string, parameters: string[], txId?: TransactionId): Promise<Buffer>;

		// TODO: similar to above regarding returning the eventhubs
		getEventHubs(): ChannelEventHub[];
	}


	// TODO: Wallet plugin type definitions, only defines end user apis, not spi's
	export abstract class Wallet {
		import(label: string, mspId: string, certificate: string, privateKey?: string): Promise<void>;
		export(label: string): Promise<any>; // what should this provide ?
		update(label: string, certificate: string, privateKey?: string): Promise<void>;
		delete(label: string): Promise<void>;
		list(): Promise<any>;  // Todo what should list provide ?
		exists(label: string): Promise<boolean>;
		setKeyWalletMixin(walletMixin: WalletMixin): void;
	}

	export interface WalletMixin {
		setupKeyStore(client: Client, label: string): void;
		createCryptoContent(publicCert: string, privateKey: string): Promise<any>; // TODO: need a definition for the return
		exportCryptoContent(user: User): any; // TODO: Need to define the return
	}

	// Real usable Wallet implementations
	export class InMemoryWallet extends Wallet {
	}

	export class FileSystemWallet extends Wallet {
		constructor(path: string);
	}

	export class CouchDBWallet extends Wallet {
		constructor(options: any); // TODO: need to define the option format here
	}

	export class HSMWalletMixin implements WalletMixin {  // TODO: do we need to declare that it implements WalletMixin ?
		constructor(library: string, slot: number, pin: string, userType: string);
		setupKeyStore(client: Client, label: string): void;
		createCryptoContent(publicCert: string, privateKey: string): Promise<any>; // TODO: need a definition
		exportCryptoContent(user: User): any; // TODO: Need to define the return
	}

	// query handler plugin type definitions
	export abstract class QueryHandler {
		constructor(channel: Channel, mspId: string, peerMap: Map<string, any>, queryOptions: any); //TODO: need a definition of the peer map

		queryChaincode(chaincodeId: string, functionName: string, params: string, txId: TransactionId): Promise<Buffer>;
	}


	// Event Handler plugin type definitions
	export abstract class EventHandlerFactory {
		constructor(channel: string, mspId: string, peerMap: Map<string, any>, options: any); //TODO:

		addEventHub(eventHub: ChannelEventHub): void;
		//TODO: need to consider how this should be returned
		getEventHubs(): ChannelEventHub[];
		setEventHubs(availableEventHubs: ChannelEventHub[]): void;
		checkEventHubs(): void;
		disconnect(): void;
		chaincodeEventsEnabled(): boolean;
		//abstract createChaincodeEventHandler(chaincodeId: string, eventName: string): ChaincodeEventHandler;
		abstract createTxEventHandler(txid: string): TxEventHandler;
		//abstract createBlockEventHandler(): BlockEventHandler;
	}

	export abstract class TxEventHandler extends EventHandlerFactory {
		//TODO: should the eventHubs be an array or an EventHubMap ?
		//TODO: do we want timeout to be explicit rather than an option ?
		constructor(eventHubs: ChannelEventHub[], mspId: string, txId: string, options: any);
		abstract startListening() : void;
		abstract waitForEvents() : Promise<void>;
		abstract cancelListening(): void;
	}

	// real implementation definition, bit annoying to have to define
	// it twice, once for JS users and again for TS users
	export enum DefaultEventHandlerStrategies {
		MSPID_SCOPE_ALLFORTX = 'MSPID_SCOPE_ALLFORTX',
		MSPID_SCOPE_ANYFORTX = 'MSPID_SCOPE_ANYFORTX',
		CHANNEL_SCOPE_ALLFORTX = 'CHANNEL_SCOPE_ALLFORTX',
		CHANNEL_SCOPE_ANYFORTX = 'CHANNEL_SCOPE_ANYFORTX'
	}


}
