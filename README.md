rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ============ WALLETS ============
    // Users can read any wallet (needed for leaderboard, profile, transfers lookup)
    // Users can ONLY update their own non-sensitive fields.
    // role, isOwner, blocked, frozen, balances, tagColor, tagEffect, hideRole,
    // customTags, vipUntil, avatarFrame can NEVER be written by the client directly —
    // only Cloud Functions (which use the Admin SDK and bypass these rules) can touch them.
    match /wallets/{uid} {
      allow read: if request.auth != null;

      allow create: if request.auth != null
                    && request.auth.uid == uid
                    && request.resource.data.uid == uid
                    && request.resource.data.isOwner == false
                    && request.resource.data.role == 'user'
                    && request.resource.data.blocked == false
                    && request.resource.data.frozen == false
                    && request.resource.data.balances.USD == 0
                    && request.resource.data.balances.UAH == 0
                    && request.resource.data.balances.RUB == 0
                    && request.resource.data.balances.TON == 0
                    && request.resource.data.balances.BTC == 0
                    && request.resource.data.balances.ETH == 0;

      allow update: if request.auth != null
                    && request.auth.uid == uid
                    // Protected fields must remain unchanged in any client-side update
                    && request.resource.data.isOwner == resource.data.isOwner
                    && request.resource.data.role == resource.data.role
                    && request.resource.data.blocked == resource.data.blocked
                    && request.resource.data.frozen == resource.data.frozen
                    && request.resource.data.balances == resource.data.balances
                    && request.resource.data.get('tagColor', null) == resource.data.get('tagColor', null)
                    && request.resource.data.get('tagEffect', null) == resource.data.get('tagEffect', null)
                    && request.resource.data.get('tagName', null) == resource.data.get('tagName', null)
                    && request.resource.data.get('hideRole', false) == resource.data.get('hideRole', false)
                    && request.resource.data.get('customTags', []) == resource.data.get('customTags', [])
                    && request.resource.data.get('vipUntil', 0) == resource.data.get('vipUntil', 0)
                    && request.resource.data.get('avatarFrame', '') == resource.data.get('avatarFrame', '')
                    && request.resource.data.get('themeCode', '') == resource.data.get('themeCode', '')
                    && request.resource.data.get('themeData', null) == resource.data.get('themeData', null)
                    && request.resource.data.get('stocks', {}) == resource.data.get('stocks', {});

      // Deletion only via Cloud Function (Admin SDK bypasses rules entirely)
      allow delete: if false;
    }

    // ============ TRANSACTIONS ============
    // Read-only ledger. Only Cloud Functions create transaction records.
    match /transactions/{txId} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    // ============ CHECKS ============
    // Checks still allow direct client writes for simple create/redeem flow,
    // but balance changes triggered by checks happen via Cloud Function only.
    match /checks/{checkId} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    // ============ DEPOSIT REQUESTS ============
    match /depositRequests/{reqId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow update: if request.auth != null
                    && resource.data.uid == request.auth.uid
                    && request.resource.data.status == resource.data.status; // user can only append messages, not change status
      allow delete: if false;
    }

    // ============ REPORTS (support tickets) ============
    match /reports/{reportId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow update: if request.auth != null; // status changes validated server-side via callable when needed
      allow delete: if false;
    }

    // ============ TG/DISCORD VERIFICATION REQUESTS ============
    match /tgRequests/{reqId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow update: if false; // only Cloud Function approves/denies
      allow delete: if false;
    }

    // ============ DELETE ACCOUNT REQUESTS ============
    match /deleteRequests/{reqId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }

    // ============ THEMES (UI customization codes) ============
    match /themes/{themeCode} {
      allow read: if request.auth != null;
      allow write: if false; // only Cloud Function writes after payment validated
    }

    // ============ STOCKS MARKET DATA ============
    match /stocksMeta/{doc} {
      allow read: if request.auth != null;
      allow write: if false;
    }

    // ============ CONTESTS ============
    match /contests/{contestId} {
      allow read: if request.auth != null;
      allow write: if false; // only owner via Cloud Function can create/edit
    }
    match /contestEntries/{entryId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.uid == request.auth.uid;
      allow update, delete: if false;
    }

    // Default deny
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
