# Project-specific ProGuard / R8 rules for Learning HUB

# Keep Tauri activity and application classes
-keep class dev.learninghub.app.** { *; }
-keep class app.tauri.** { *; }
-keep interface app.tauri.** { *; }

# Keep native JNI methods so Rust <-> Kotlin bindings are preserved
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep WebKit JavaScriptInterface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# AndroidX WebKit preservation
-keep class androidx.webkit.** { *; }

# Optimize and remove unused attributes to reduce DEX size
-repackageclasses ''
-allowaccessmodification
-dontwarn **
