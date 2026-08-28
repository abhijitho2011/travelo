import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:google_sign_in/google_sign_in.dart';

import '../api/api_exception.dart';

/// Performs Google sign-in through Firebase and returns the Firebase ID token.
/// The backend verifies this token and only issues a Tavelo session when the
/// email matches an owner account created by the Super Admin.
class GoogleAuthService {
  /// Returns a fresh Firebase ID token, or throws [ApiException] on failure /
  /// cancellation.
  Future<String> signInAndGetIdToken() async {
    final auth = FirebaseAuth.instance;
    UserCredential cred;

    try {
      if (kIsWeb) {
        final provider = GoogleAuthProvider()
          ..addScope('email')
          ..setCustomParameters({'prompt': 'select_account'});
        cred = await auth.signInWithPopup(provider);
      } else {
        final googleUser = await GoogleSignIn().signIn();
        if (googleUser == null) {
          throw const ApiException(code: 'CANCELLED', message: 'Sign-in cancelled.');
        }
        final googleAuth = await googleUser.authentication;
        final credential = GoogleAuthProvider.credential(
          accessToken: googleAuth.accessToken,
          idToken: googleAuth.idToken,
        );
        cred = await auth.signInWithCredential(credential);
      }
    } on FirebaseAuthException catch (e) {
      throw ApiException(code: e.code, message: e.message ?? 'Google sign-in failed.');
    }

    final idToken = await cred.user?.getIdToken();
    if (idToken == null) {
      throw const ApiException(code: 'NO_TOKEN', message: 'Could not obtain Google token.');
    }
    return idToken;
  }

  Future<void> signOut() async {
    try {
      if (!kIsWeb) await GoogleSignIn().signOut();
      await FirebaseAuth.instance.signOut();
    } catch (_) {}
  }
}
