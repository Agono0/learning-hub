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
if (!defaultKeystore.exists() && System.getenv("KEYSTORE_FILE") == null) {
    try {
        val javaHome = System.getProperty("java.home") ?: System.getenv("JAVA_HOME")
        val isWindows = System.getProperty("os.name").lowercase().contains("windows")
        val keytoolExe = if (isWindows) "keytool.exe" else "keytool"
        val keytoolBin = if (javaHome != null && File(javaHome, "bin/$keytoolExe").exists()) {
            File(javaHome, "bin/$keytoolExe").absolutePath
        } else {
            keytoolExe
        }
        ProcessBuilder(
            keytoolBin,
            "-genkeypair", "-v",
            "-keystore", defaultKeystore.absolutePath,
            "-alias", "learninghub",
            "-keyalg", "RSA",
            "-keysize", "2048",
            "-validity", "10000",
            "-storepass", "learninghub123",
            "-keypass", "learninghub123",
            "-dname", "CN=LearningHUB, OU=Mobile, O=LearningHUB, C=US"
        ).inheritIO().start().waitFor()
    } catch (_: Exception) {}
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
            val keystoreFile = System.getenv("KEYSTORE_FILE")
                ?: (if (project.hasProperty("KEYSTORE_FILE")) project.property("KEYSTORE_FILE")?.toString() else null)
                ?: defaultKeystore.takeIf { it.exists() }?.absolutePath
            if (keystoreFile != null && file(keystoreFile).exists()) {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("KEYSTORE_PASSWORD")
                    ?: (if (project.hasProperty("KEYSTORE_PASSWORD")) project.property("KEYSTORE_PASSWORD")?.toString() else null) ?: "learninghub123"
                keyAlias = System.getenv("KEY_ALIAS")
                    ?: (if (project.hasProperty("KEY_ALIAS")) project.property("KEY_ALIAS")?.toString() else null) ?: "learninghub"
                keyPassword = System.getenv("KEY_PASSWORD")
                    ?: (if (project.hasProperty("KEY_PASSWORD")) project.property("KEY_PASSWORD")?.toString() else null) ?: "learninghub123"
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
            val resolvedKeystore = System.getenv("KEYSTORE_FILE")
                ?: (if (project.hasProperty("KEYSTORE_FILE")) project.property("KEYSTORE_FILE")?.toString() else null)
                ?: defaultKeystore.takeIf { it.exists() }?.absolutePath
            if (resolvedKeystore != null && file(resolvedKeystore).exists()) {
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
