export class LRU<K, V> {
    max: number
    cache: Map<K, V>

    constructor(max = 10) {
        this.max = max;
        this.cache = new Map();
    }

    private findKey(key: K): K | undefined {
        if (this.cache.has(key)) return key;
        if (key && typeof (key as any).equals === 'function') {
            for (const k of this.cache.keys()) {
                if (k && typeof (k as any).equals === 'function' && (k as any).equals(key)) {
                    return k;
                }
            }
        }
        return undefined;
    }

    get(key: K) {
        const existingKey = this.findKey(key);
        if (existingKey !== undefined) {
            const item = this.cache.get(existingKey)!;
            // refresh key
            this.cache.delete(existingKey);
            this.cache.set(key, item);
            return item;
        }
        return undefined;
    }

    set(key: K, val: V) {
        // refresh key
        const existingKey = this.findKey(key);
        if (existingKey !== undefined) {
            this.cache.delete(existingKey);
        } else if (this.cache.size >= this.max) {
            this.cache.delete(this.first());
        }
        this.cache.set(key, val);
    }

    first(): K {
        return this.cache.keys().next().value;
    }
}
