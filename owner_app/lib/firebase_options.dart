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

  static const FirebaseOptions web = FirebaseOptions(
    apiKey: 'AIzaSyDTyOc2-jyPMirqGEzm_IKdsD05bYPY2N4',
    authDomain: 'tavelo-c4669.firebaseapp.com',
    projectId: 'tavelo-c4669',
    storageBucket: 'tavelo-c4669.firebasestorage.app',
    messagingSenderId: '754494069859',
    appId: '1:754494069859:web:66edfe94fdba8e6e762c56',
    measurementId: 'G-B925V8XDZJ',
  );

  // Placeholder — replace with the Android app's values from the Firebase
  // console (google-services.json) before shipping the Android build.
  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyDTyOc2-jyPMirqGEzm_IKdsD05bYPY2N4',
    appId: '1:754494069859:web:66edfe94fdba8e6e762c56',
    messagingSenderId: '754494069859',
    projectId: 'tavelo-c4669',
    storageBucket: 'tavelo-c4669.firebasestorage.app',
  );

  // Placeholder — replace with the iOS app's values (GoogleService-Info.plist).
  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'AIzaSyDTyOc2-jyPMirqGEzm_IKdsD05bYPY2N4',
    appId: '1:754494069859:web:66edfe94fdba8e6e762c56',
    messagingSenderId: '754494069859',
    projectId: 'tavelo-c4669',
    storageBucket: 'tavelo-c4669.firebasestorage.app',
    iosBundleId: 'com.travelo.travelo_owner',
  );
}
