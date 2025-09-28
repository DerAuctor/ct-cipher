import * as path from 'path';


/**
 * The default path to the agent config file
 */
export const DEFAULT_CONFIG_PATH = 'memAgent/XInfty.yml';

/**
 * Resolve the configuration file path.
 * - If it's absolute, return as-is.
 * - If it's the default config, resolve relative to the package installation root.
 * - Otherwise resolve relative to the current working directory.
 *
 * @param configPath - The config path to resolve
 * @returns The resolved absolute path to the config file
 */
export function resolveConfigPath(configPath: string): string {
	// If it's an absolute path, return as-is
	if (path.isAbsolute(configPath)) {
		return configPath;
	}

	// For all relative paths, resolve relative to current working directory
	return path.resolve(process.cwd(), configPath);
}
