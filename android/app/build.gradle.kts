import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun prop(name: String): String = (project.findProperty(name) as String?).orEmpty()

android {
    namespace = "com.geotracker.android"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.geotracker.android"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        val webUrl = URI(prop("geotrackerWebUrl").trimEnd('/'))
        manifestPlaceholders["webHost"] = webUrl.host
        manifestPlaceholders["webPathPrefix"] = webUrl.path.orEmpty()

        buildConfigField("String", "WEB_URL", "\"${prop("geotrackerWebUrl").trimEnd('/')}\"")
        buildConfigField("String", "FIREBASE_PROJECT_ID", "\"${prop("geotrackerFirebaseProjectId")}\"")
        buildConfigField("String", "FIREBASE_API_KEY", "\"${prop("geotrackerFirebaseApiKey")}\"")
    }

    signingConfigs {
        // Release signing is configured from environment variables in CI.
        // Without them, release builds fall back to the debug key so the APK
        // is still installable for testing.
        val keystore = System.getenv("ANDROID_KEYSTORE_FILE")
        if (!keystore.isNullOrBlank()) {
            create("release") {
                storeFile = file(keystore)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    lint {
        // Adaptive icons must live in mipmap-anydpi-v26 for AAPT.
        disable += "ObsoleteSdkInt"
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("com.google.android.material:material:1.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    // Google code scanner: scans the dashboard's QR code without needing the
    // CAMERA permission (the scanning UI runs inside Google Play services).
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
