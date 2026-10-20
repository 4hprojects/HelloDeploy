// Java LTS releases with official Eclipse Temurin images. Review against
// https://adoptium.net/support/ before adding or removing one.
export const APPROVED_JAVA_VERSIONS = Object.freeze(['17', '21', '25']);
export const DEFAULT_JAVA_VERSION = '21';

/** The port Spring Boot is told to listen on inside the container. */
export const JAVA_PORT = 8080;

// Checked in order; the first match names the build's Java release.
const JAVA_VERSION_PATTERNS = Object.freeze([
  /<java\.version>\s*([\d.]+)\s*</,
  /<maven\.compiler\.release>\s*([\d.]+)\s*</,
  /<release>\s*([\d.]+)\s*<\/release>/,
  /JavaLanguageVersion\.of\(\s*['"]?(\d+)['"]?\s*\)/,
  /(?:source|target)Compatibility\s*=\s*(?:JavaVersion\.VERSION_)?['"]?([\d._]+)['"]?/,
]);

/**
 * Read the Java release a Maven or Gradle build targets. Without a declared
 * release the default version is used.
 *
 * @param {{ pom?: string|null, gradle?: string|null }} buildFiles
 */
export function resolveJavaVersion({ pom = null, gradle = null } = {}) {
  const content = [pom, gradle].filter(Boolean).join('\n');
  const declared = JAVA_VERSION_PATTERNS.map((pattern) => content.match(pattern)?.[1]).find(
    Boolean,
  );
  if (!declared) {
    return { version: DEFAULT_JAVA_VERSION, error: null };
  }
  // `1.8` and `VERSION_1_8` are the pre-9 spelling of Java 8.
  const parts = declared.split(/[._]/);
  const version = parts[0] === '1' && parts[1] ? parts[1] : parts[0];
  if (!APPROVED_JAVA_VERSIONS.includes(version)) {
    return {
      version: null,
      error: `Java ${version} is not supported. Build for one of ${APPROVED_JAVA_VERSIONS.join(', ')}.`,
    };
  }
  return { version, error: null };
}
