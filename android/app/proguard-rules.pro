# ─── Capacitor bridge ────────────────────────────────────────────────────────
# Keep the Capacitor bridge, plugin registry, and JSInterface so the WebView
# can still call into native code after minification.
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# Keep the app's own Activity (extends BridgeActivity)
-keep class com.breedingplanner.mobile.** { *; }

# ─── WebView JavaScript interface ─────────────────────────────────────────────
# Any method annotated @JavascriptInterface must survive shrinking/renaming.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ─── AndroidX / Jetpack ──────────────────────────────────────────────────────
-keep class androidx.core.app.CoreComponentFactory { *; }
-keep class androidx.appcompat.** { *; }
-keep class androidx.lifecycle.** { *; }
-dontwarn androidx.**

# ─── Capacitor bundled plugins ───────────────────────────────────────────────
# @capacitor/app
-keep class com.capacitorjs.plugins.app.** { *; }
# @capacitor/camera
-keep class com.capacitorjs.plugins.camera.** { *; }
# @capacitor/filesystem
-keep class com.capacitorjs.plugins.filesystem.** { *; }
# @capacitor/haptics
-keep class com.capacitorjs.plugins.haptics.** { *; }
# @capacitor/keyboard
-keep class com.capacitorjs.plugins.keyboard.** { *; }
# @capacitor/network
-keep class com.capacitorjs.plugins.network.** { *; }
# @capacitor/preferences
-keep class com.capacitorjs.plugins.preferences.** { *; }
# @capacitor/push-notifications
-keep class com.capacitorjs.plugins.pushnotifications.** { *; }
# @capacitor/splash-screen
-keep class com.capacitorjs.plugins.splashscreen.** { *; }
# @capacitor/status-bar
-keep class com.capacitorjs.plugins.statusbar.** { *; }

# ─── Google Services (push notifications, if present) ────────────────────────
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ─── Crash / debugging ───────────────────────────────────────────────────────
# Preserve file and line information so stack traces are readable.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep annotations used for reflection (Parcelable, Serializable, etc.)
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions

# ─── Parcelable / Serializable ────────────────────────────────────────────────
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ─── Enum safety ─────────────────────────────────────────────────────────────
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ─── R8 / ProGuard compatibility ─────────────────────────────────────────────
-dontpreverify
-verbose
