/* Product snapshots stay in this browser, including captured photos. */
const LineFlowProducts = (() => {
  let databasePromise;

  function openDatabase() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open("lineflow-processor-products", 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("products", { keyPath: "key" });
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Close other LineFlow tabs and try again."));
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => { database.close(); databasePromise = null; };
          resolve(database);
        };
      }).catch(error => { databasePromise = null; throw error; });
    }
    return databasePromise;
  }

  async function transact(mode, action) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("products", mode);
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error("Product storage was interrupted."));
      transaction.onerror = () => reject(transaction.error);
      action(transaction.objectStore("products"), value => { result = value; });
    });
  }

  function list() {
    return transact("readonly", (store, done) => {
      const products = [];
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { done(products.sort((a, b) => a.name.localeCompare(b.name))); return; }
        products.push({ key: cursor.value.key, name: cursor.value.name });
        cursor.continue();
      };
    });
  }

  function get(key) {
    return transact("readonly", (store, done) => {
      const request = store.get(key);
      request.onsuccess = () => done(request.result);
    });
  }

  function save(product) {
    return transact("readwrite", store => { store.put(product); });
  }

  return { list, get, save };
})();
