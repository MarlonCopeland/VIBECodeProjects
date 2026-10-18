// @react-native-async-storage/async-storage -> localStorage. Only reached if
// shared code ever skips its Platform.OS === 'web' branch.

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  },
};

export default AsyncStorage;
