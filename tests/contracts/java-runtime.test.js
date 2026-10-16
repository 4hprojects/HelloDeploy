import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BuildStrategy,
  DEFAULT_JAVA_VERSION,
  RuntimeType,
  getBuildStrategyRuntime,
  isJavaBuildStrategy,
  resolveJavaVersion,
} from '@hellodeploy/contracts';

describe('Java build strategies', () => {
  it('recognizes the Maven and Gradle strategies', () => {
    assert.deepEqual(
      [BuildStrategy.JAVA_MAVEN_V1, BuildStrategy.JAVA_GRADLE_V1].map(isJavaBuildStrategy),
      [true, true],
    );
  });

  it('requires the JAVA runtime', () => {
    assert.equal(getBuildStrategyRuntime(BuildStrategy.JAVA_GRADLE_V1), RuntimeType.JAVA);
  });
});

describe('resolveJavaVersion', () => {
  it('uses the default version when no build file names one', () => {
    assert.deepEqual(resolveJavaVersion({ pom: '<project/>' }), {
      version: DEFAULT_JAVA_VERSION,
      error: null,
    });
  });

  it('reads the Spring Boot java.version property from pom.xml', () => {
    assert.deepEqual(
      resolveJavaVersion({ pom: '<properties><java.version>17</java.version></properties>' }),
      { version: '17', error: null },
    );
  });

  it('reads maven.compiler.release from pom.xml', () => {
    assert.deepEqual(
      resolveJavaVersion({
        pom: '<properties><maven.compiler.release>25</maven.compiler.release></properties>',
      }),
      { version: '25', error: null },
    );
  });

  it('reads a Gradle toolchain language version', () => {
    assert.deepEqual(
      resolveJavaVersion({
        gradle: 'java { toolchain { languageVersion = JavaLanguageVersion.of(17) } }',
      }),
      { version: '17', error: null },
    );
  });

  it('reads a Gradle sourceCompatibility enum', () => {
    assert.deepEqual(
      resolveJavaVersion({ gradle: 'sourceCompatibility = JavaVersion.VERSION_21' }),
      { version: '21', error: null },
    );
  });

  it('rejects an unapproved version with the supported list', () => {
    assert.match(
      resolveJavaVersion({ pom: '<java.version>11</java.version>' }).error,
      /17, 21, 25/,
    );
  });

  it('reads the legacy 1.8 form as Java 8 and rejects it', () => {
    assert.match(
      resolveJavaVersion({ pom: '<java.version>1.8</java.version>' }).error,
      /Java 8 is not supported/,
    );
  });
});
