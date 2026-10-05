import { createMemoryStore } from "./memory-store";
import { runStoreContract } from "./store-contract";

runStoreContract("in-memory", createMemoryStore);