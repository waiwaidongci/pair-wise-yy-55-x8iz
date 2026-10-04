// Node 环境的 localStorage 垫片，必须在 store 之前导入
class MemoryStorage {
  private map = new Map<string, string>()
  get length() { return this.map.size }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null }
  setItem(key: string, value: string) { this.map.set(key, String(value)) }
  removeItem(key: string) { this.map.delete(key) }
  clear() { this.map.clear() }
  key(index: number) { return [...this.map.keys()][index] ?? null }
}
;(globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage() as unknown as Storage
