import "fake-indexeddb/auto";
import { runStoreContract } from "./store-contract";
import { createIndexedDbStore } from "./indexeddb-store";

// A fresh, uniquely named database per test keeps tests independent.
runStoreContract("indexeddb", () =>
  createIndexedDbStore(`test-${crypto.randomUUID()}`),
);