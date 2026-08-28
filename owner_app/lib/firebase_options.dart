import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

/// Firebase configuration for the Travelo owner app.
///
/// These values are the Firebase *web* app config. Firebase web API keys are
/// public by design (they identify the project, they are not a secret); access
/// is controlled by Firebase Authorized Domains and by the Travelo backend,
/// which independently verifies each Google ID token and only issues a session
/// to an owner account created by the Super Admin.
///
/// Android/iOS use the same project. For production mobile builds, generate the
/// platform apps in the Firebase console (or run `flutterfire configure`) and
/// replace the appId/apiKey below with the Android/iOS values.
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) return web;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        return web;
    }
  }

  // Values come from --dart-define (set as Railway service variables and passed
  // through as Docker build args). The defaults are the current Travelo project
  // so local builds work without extra flags.
  static const String _apiKey = String.fromEnvironment(
    'FIREBASE_API_KEY',
    defaultValue: 'AIzaSyDTyOc2-jyPMirqGEzm_IKdsD05bYPY2N4',
  );
  static const String _authDomain = String.fromEnvironment(
    'FIREBASE_AUTH_DOMAIN',
    defaultValue: 'tavelo-c4669.firebaseapp.com',
  );
  static const String _projectId = String.fromEnvironment(
    'FIREBASE_PROJECT_ID',
    defaultValue: 'tavelo-c4669',
  );
  static const String _storageBucket = String.fromEnvironment(
    'FIREBASE_STORAGE_BUCKET',
    defaultValue: 'tavelo-c4669.firebasestorage.app',
  );
  static const String _senderId = String.fromEnvironment(
    'FIREBASE_MESSAGING_SENDER_ID',
    defaultValue: '754494069859',
  );
  static const String _appId = String.fromEnvironment(
    'FIREBASE_APP_ID',
    defaultValue: '1:754494069859:web:66edfe94fdba8e6e762c56',
  );
  static const String _measurementId = String.fromEnvironment(
    'FIREBASE_MEASUREMENT_ID',
    defaultValue: 'G-B925V8XDZJ',
  );

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: _apiKey,
    authDomain: _authDomain,
    projectId: _projectId,
    storageBucket: _storageBucket,
    messagingSenderId: _senderId,
    appId: _appId,
    measurementId: _measurementId,
  );

  // Android/iOS reuse the same project. For production mobile builds, create the
  // platform apps in the Firebase console and pass their values via --dart-define
  // (FIREBASE_ANDROID_APP_ID / FIREBASE_IOS_APP_ID) or drop in the generated
  // google-services.json / GoogleService-Info.plist.
  static const FirebaseOptions android = FirebaseOptions(
    apiKey: _apiKey,
    appId: String.fromEnvironment('FIREBASE_ANDROID_APP_ID', defaultValue: _appId),
    messagingSenderId: _senderId,
    projectId: _projectId,
    storageBucket: _storageBucket,
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: _apiKey,
    appId: String.fromEnvironment('FIREBASE_IOS_APP_ID', defaultValue: _appId),
    messagingSenderId: _senderId,
    projectId: _projectId,
    storageBucket: _storageBucket,
    iosBundleId: 'com.travelo.travelo_owner',
  );
}
