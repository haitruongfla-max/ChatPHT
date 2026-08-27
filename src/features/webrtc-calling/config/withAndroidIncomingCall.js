const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function ensureNamedComponent(application, key, name, component) {
  application[key] = application[key] ?? [];
  if (!application[key].some((entry) => entry.$?.["android:name"] === name)) application[key].push(component);
}

function escapeKotlin(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function nativeSources(packageName, scheme) {
  const safeScheme = escapeKotlin(scheme);
  return {
    "IncomingCallContract.kt": `package ${packageName}.calls

import android.content.Context
import android.content.Intent
import android.net.Uri

internal object IncomingCallContract {
  const val EVENT_TYPE = "eventType"
  const val INCOMING_CALL = "incoming_call"
  const val CALL_ID = "callId"
  const val CONVERSATION_ID = "conversationId"
  const val CALLER_ID = "callerId"
  const val CALLER_NAME = "callerName"
  const val MODE = "mode"
  const val EXPIRES_AT = "expiresAt"
  const val ACTION = "callAction"
  const val ANSWER = "answer"
  const val DECLINE = "decline"
  const val SHOW = "show"

  fun appIntent(context: Context, data: Map<String, String>, action: String): Intent {
    val uri = Uri.Builder()
      .scheme("${safeScheme}")
      .authority("incoming-call")
      .appendQueryParameter(CALL_ID, data[CALL_ID].orEmpty())
      .appendQueryParameter(CONVERSATION_ID, data[CONVERSATION_ID].orEmpty())
      .appendQueryParameter(CALLER_ID, data[CALLER_ID].orEmpty())
      .appendQueryParameter(CALLER_NAME, data[CALLER_NAME].orEmpty())
      .appendQueryParameter(MODE, data[MODE].orEmpty())
      .appendQueryParameter(EXPIRES_AT, data[EXPIRES_AT].orEmpty())
      .appendQueryParameter(ACTION, action)
      .build()
    return Intent(Intent.ACTION_VIEW, uri)
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }
}
`,
    "IncomingCallNotifier.kt": `package ${packageName}.calls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person

internal object IncomingCallNotifier {
  const val CHANNEL_ID = "calls"
  private const val NOTIFICATION_OFFSET = 70_000

  private fun notificationId(callId: String) = NOTIFICATION_OFFSET + (callId.hashCode() and 0x7fffffff) % 900_000

  fun show(context: Context, data: Map<String, String>) {
    val callId = data[IncomingCallContract.CALL_ID].orEmpty()
    if (callId.isBlank()) return
    createChannel(context)
    val name = data[IncomingCallContract.CALLER_NAME]?.take(80)?.ifBlank { null } ?: "Người dùng ChatPHT"
    val showIntent = pendingActivity(context, data, IncomingCallContract.SHOW, 10)
    val declineIntent = pendingActivity(context, data, IncomingCallContract.DECLINE, 11)
    val answerIntent = pendingActivity(context, data, IncomingCallContract.ANSWER, 12)
    val person = Person.Builder().setName(name).setImportant(true).build()
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.sym_call_incoming)
      .setContentTitle(name)
      .setContentText("Cuộc gọi đến")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true)
      .setAutoCancel(false)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setFullScreenIntent(showIntent, true)
      .setContentIntent(showIntent)
      .setStyle(NotificationCompat.CallStyle.forIncomingCall(person, declineIntent, answerIntent))
      .build()
    NotificationManagerCompat.from(context).notify(notificationId(callId), notification)
  }

  fun cancel(context: Context, callId: String?) {
    if (!callId.isNullOrBlank()) NotificationManagerCompat.from(context).cancel(notificationId(callId))
  }

  private fun pendingActivity(context: Context, data: Map<String, String>, action: String, salt: Int): PendingIntent {
    val intent = Intent(context, IncomingCallActivity::class.java).apply {
      data.forEach { (key, value) -> putExtra(key, value) }
      putExtra(IncomingCallContract.ACTION, action)
      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    return PendingIntent.getActivity(
      context,
      notificationId(data[IncomingCallContract.CALL_ID].orEmpty()) + salt,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(CHANNEL_ID, "Cuộc gọi đến", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Hiển thị cuộc gọi ChatPHT đến và cho phép nghe hoặc từ chối."
      setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), null)
      enableVibration(true)
      lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }
}
`,
    "IncomingCallActivity.kt": `package ${packageName}.calls

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class IncomingCallActivity : Activity() {
  private val callData: Map<String, String>
    get() = listOf(
      IncomingCallContract.CALL_ID,
      IncomingCallContract.CONVERSATION_ID,
      IncomingCallContract.CALLER_ID,
      IncomingCallContract.CALLER_NAME,
      IncomingCallContract.MODE,
      IncomingCallContract.EXPIRES_AT,
    ).mapNotNull { key -> intent.getStringExtra(key)?.let { value -> key to value } }.toMap()

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)
    }
    when (intent.getStringExtra(IncomingCallContract.ACTION) ?: IncomingCallContract.SHOW) {
      IncomingCallContract.ANSWER -> respond(IncomingCallContract.ANSWER)
      IncomingCallContract.DECLINE -> respond(IncomingCallContract.DECLINE)
      else -> renderIncomingCall()
    }
  }

  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    when (intent.getStringExtra(IncomingCallContract.ACTION) ?: IncomingCallContract.SHOW) {
      IncomingCallContract.ANSWER -> respond(IncomingCallContract.ANSWER)
      IncomingCallContract.DECLINE -> respond(IncomingCallContract.DECLINE)
      else -> renderIncomingCall()
    }
  }

  private fun renderIncomingCall() {
    val caller = callData[IncomingCallContract.CALLER_NAME]?.take(80)?.ifBlank { null } ?: "Người dùng ChatPHT"
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setPadding(48, 72, 48, 72)
    }
    root.addView(TextView(this).apply { text = caller; textSize = 28f; gravity = Gravity.CENTER })
    root.addView(TextView(this).apply { text = "Cuộc gọi đến"; textSize = 18f; gravity = Gravity.CENTER })
    root.addView(Button(this).apply { text = "Nghe"; setOnClickListener { respond(IncomingCallContract.ANSWER) } })
    root.addView(Button(this).apply { text = "Từ chối"; setOnClickListener { respond(IncomingCallContract.DECLINE) } })
    setContentView(root)
  }

  private fun respond(action: String) {
    val callId = callData[IncomingCallContract.CALL_ID]
    IncomingCallNotifier.cancel(this, callId)
    ChatPhtConnectionService.finishConnection(callId, action)
    startActivity(IncomingCallContract.appIntent(this, callData, action))
    finish()
  }
}
`,
    "ChatPhtConnectionService.kt": `package ${packageName}.calls

import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import java.util.concurrent.ConcurrentHashMap

class ChatPhtConnectionService : ConnectionService() {
  override fun onCreateIncomingConnection(phoneAccountHandle: PhoneAccountHandle, request: ConnectionRequest): Connection {
    val callId = request.extras.getString(IncomingCallContract.CALL_ID).orEmpty()
    val callerName = request.extras.getString(IncomingCallContract.CALLER_NAME).orEmpty()
    return ChatPhtConnection(applicationContext, callId, callerName).also { connection ->
      connections[callId] = connection
      connection.setConnectionProperties(Connection.PROPERTY_SELF_MANAGED)
      connection.setAddress(Uri.fromParts(PhoneAccount.SCHEME_TEL, "chatpht", null), TelecomManager.PRESENTATION_ALLOWED)
      connection.setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED)
      connection.setInitializing()
      connection.setRinging()
    }
  }

  companion object {
    private const val ACCOUNT_ID = "chatpht-p2p-calls"
    private val connections = ConcurrentHashMap<String, ChatPhtConnection>()

    fun reportIncomingCall(context: Context, data: Map<String, String>) {
      val callId = data[IncomingCallContract.CALL_ID].orEmpty()
      if (callId.isBlank()) return
      try {
        val telecom = context.getSystemService(TelecomManager::class.java)
        val handle = PhoneAccountHandle(ComponentName(context, ChatPhtConnectionService::class.java), ACCOUNT_ID)
        val account = PhoneAccount.builder(handle, "ChatPHT").setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED).build()
        telecom.registerPhoneAccount(account)
        val extras = Bundle().apply { data.forEach { (key, value) -> putString(key, value) } }
        telecom.addNewIncomingCall(handle, extras)
      } catch (_: SecurityException) {
        // Notification CallStyle remains available when the device refuses self-managed Telecom setup.
      } catch (_: IllegalArgumentException) {
        // Invalid/expired call must not crash Firebase's background service.
      }
    }

    fun finishConnection(callId: String?, action: String) {
      if (callId.isNullOrBlank()) return
      connections.remove(callId)?.let { connection ->
        if (action == IncomingCallContract.ANSWER) connection.setActive() else connection.setDisconnected(Connection.DisconnectCause(Connection.DisconnectCause.REJECTED))
        connection.destroy()
      }
    }

    private fun openApp(context: Context, callId: String, action: String) {
      context.startActivity(IncomingCallContract.appIntent(context, mapOf(IncomingCallContract.CALL_ID to callId), action))
    }

    private class ChatPhtConnection(private val context: Context, private val callId: String, callerName: String) : Connection() {
      init { setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED) }
      override fun onAnswer() { openApp(context, callId, IncomingCallContract.ANSWER) }
      override fun onReject() { openApp(context, callId, IncomingCallContract.DECLINE); setDisconnected(DisconnectCause(DisconnectCause.REJECTED)); destroy() }
      override fun onDisconnect() { openApp(context, callId, IncomingCallContract.DECLINE); setDisconnected(DisconnectCause(DisconnectCause.LOCAL)); destroy() }
    }
  }
}
`,
    "ChatPhtFirebaseMessagingService.kt": `package ${packageName}.calls

import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class ChatPhtFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val data = remoteMessage.data
    if (data[IncomingCallContract.EVENT_TYPE] == IncomingCallContract.INCOMING_CALL && data[IncomingCallContract.CALL_ID]?.isNotBlank() == true) {
      IncomingCallNotifier.show(this, data)
      ChatPhtConnectionService.reportIncomingCall(this, data)
      return
    }
    super.onMessageReceived(remoteMessage)
  }
}
`,
  };
}

function withAndroidIncomingCall(config) {
  const packageName = config.android?.package ?? "com.app.swiftchat";
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : (config.scheme ?? "chatpht");
  config = AndroidConfig.Permissions.withPermissions(config, [
    "android.permission.USE_FULL_SCREEN_INTENT",
    "android.permission.MANAGE_OWN_CALLS",
    "android.permission.WAKE_LOCK",
    "android.permission.VIBRATE",
  ]);

  config = withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes("firebase-messaging")) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /dependencies\s*\{/, 
        'dependencies {\n    implementation(platform("com.google.firebase:firebase-bom:33.7.0"))\n    implementation("com.google.firebase:firebase-messaging")\n    implementation("androidx.core:core-ktx:1.13.1")',
      );
    }
    return mod;
  });

  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) return mod;
    ensureNamedComponent(application, "service", ".calls.ChatPhtFirebaseMessagingService", {
      $: { "android:name": ".calls.ChatPhtFirebaseMessagingService", "android:exported": "false" },
      "intent-filter": [{ $: { "android:priority": "1" }, action: [{ $: { "android:name": "com.google.firebase.MESSAGING_EVENT" } }] }],
    });
    ensureNamedComponent(application, "service", ".calls.ChatPhtConnectionService", {
      $: {
        "android:name": ".calls.ChatPhtConnectionService",
        "android:exported": "false",
        "android:permission": "android.permission.BIND_TELECOM_CONNECTION_SERVICE",
      },
      "intent-filter": [{ action: [{ $: { "android:name": "android.telecom.ConnectionService" } }] }],
    });
    ensureNamedComponent(application, "activity", ".calls.IncomingCallActivity", {
      $: {
        "android:name": ".calls.IncomingCallActivity",
        "android:exported": "false",
        "android:excludeFromRecents": "true",
        "android:launchMode": "singleTop",
        "android:showWhenLocked": "true",
        "android:turnScreenOn": "true",
      },
    });
    return mod;
  });

  return withDangerousMod(config, ["android", (mod) => {
    const sourceDir = path.join(mod.modRequest.platformProjectRoot, "app", "src", "main", "java", ...packageName.split("."), "calls");
    fs.mkdirSync(sourceDir, { recursive: true });
    for (const [filename, source] of Object.entries(nativeSources(packageName, scheme))) {
      fs.writeFileSync(path.join(sourceDir, filename), source);
    }
    return mod;
  }]);
}

module.exports = createRunOncePlugin(withAndroidIncomingCall, "chatpht-android-incoming-call", "1.0.0");
