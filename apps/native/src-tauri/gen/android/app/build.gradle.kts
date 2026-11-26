import java.io.File
import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val defaultKeystore = file("release.keystore")

fun signingValue(name: String): String? =
    System.getenv(name) ?: (if (project.hasProperty(name)) project.property(name)?.toString() else null)

// Release signing never falls back to a built-in password or an auto-generated
// keystore: a release build without the real keystore and passwords fails loudly
// instead of shipping an APK signed with a publicly known default (O1-22).
val releaseKeystoreFile: String? =
    signingValue("KEYSTORE_FILE") ?: defaultKeystore.takeIf { it.exists() }?.absolutePath
val releaseRequested = gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) }
if (releaseRequested) {
    val missing = buildList {
        if (releaseKeystoreFile == null || !file(releaseKeystoreFile).exists()) add("KEYSTORE_FILE or release.keystore")
        if (signingValue("KEYSTORE_PASSWORD").isNullOrEmpty()) add("KEYSTORE_PASSWORD")
        if (signingValue("KEY_PASSWORD").isNullOrEmpty()) add("KEY_PASSWORD")
    }
    if (missing.isNotEmpty()) {
        throw GradleException("Release signing is not configured (missing: ${missing.joinToString()}). See docs/updates.md, Android signing.")
    }
}

android {
    compileSdk = 37
    namespace = "dev.learninghub.app"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "dev.learninghub.app"
        minSdk = 26
        targetSdk = 37
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }

    signingConfigs {
        create("release") {
            if (releaseKeystoreFile != null && file(releaseKeystoreFile).exists()) {
                storeFile = file(releaseKeystoreFile)
                storePassword = signingValue("KEYSTORE_PASSWORD")
                keyAlias = signingValue("KEY_ALIAS") ?: "learninghub"
                keyPassword = signingValue("KEY_PASSWORD")
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            if (releaseKeystoreFile != null && file(releaseKeystoreFile).exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                *fileTree(".") {
                    include("**/*.pro")
                    exclude("build/**")
                }.files.toTypedArray()
            )
            packaging {
                resources {
                    excludes += setOf(
                        "META-INF/*.version",
                        "META-INF/LICENSE*",
                        "META-INF/NOTICE*",
                        "META-INF/*.txt",
                        "META-INF/DEPENDENCIES",
                        "META-INF/INDEX.LIST",
                        "META-INF/*.properties",
                        "**/*.proto"
                    )
                }
            }
        }
    }

    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a", "x86_64")
            isUniversalApk = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
