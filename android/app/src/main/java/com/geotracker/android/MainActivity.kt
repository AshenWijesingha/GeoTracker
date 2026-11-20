package com.geotracker.android

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.format.DateUtils
import android.view.MotionEvent
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.geotracker.android.databinding.ActivityMainBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: Prefs
    private val handler = Handler(Looper.getMainLooper())

    private val locationPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.any { it }) requestNotificationsThenStart() else toast(R.string.permission_needed)
    }

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { startSharing() } // sharing works without it; the notification is just hidden

    private val backgroundPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { render(TrackingState.state.value) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        prefs = Prefs(this)

        binding.deviceNameInput.setText(prefs.deviceName)
        binding.deviceNameInput.doAfterTextChanged { text ->
            text?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { prefs.deviceName = it }
        }
        binding.autoStartSwitch.isChecked = prefs.autoStart
        binding.autoStartSwitch.setOnCheckedChangeListener { _, checked -> prefs.autoStart = checked }

        binding.scanButton.setOnClickListener { scanQr() }
        binding.pairButton.setOnClickListener { pairFromInput() }
        binding.linkInput.setOnEditorActionListener { _, _, _ -> pairFromInput(); true }
        binding.quickButton.setOnClickListener { newQuickTrack() }
        binding.shareIdButton.setOnClickListener { shareTrackerId() }

        binding.startButton.setOnClickListener { onStartClicked() }
        binding.pauseButton.setOnClickListener { TrackingService.send(this, TrackingService.ACTION_PAUSE) }
        binding.stopButton.setOnClickListener { TrackingService.send(this, TrackingService.ACTION_STOP) }
        binding.backgroundButton.setOnClickListener { requestBackgroundLocation() }
        binding.batteryButton.setOnClickListener {
            runCatching { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        }
        binding.consoleButton.setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${BuildConfig.WEB_URL}/dashboard/")))
        }
        setupSosButton()
        binding.safeButton.setOnClickListener {
            SosController.cancel(this) { e -> runOnUiThread { e?.let { toast(it.message ?: "Error") } } }
        }

        handleIntent(intent)
        refreshTrackerName()

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                TrackingState.state.collect { render(it) }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** A tracking link opened with the app pairs it straight away. */
    private fun handleIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (intent.action == Intent.ACTION_VIEW) pair(data.toString())
    }

    // ── Pairing ───────────────────────────────────────────────────────────

    private fun scanQr() {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        GmsBarcodeScanning.getClient(this, options).startScan()
            .addOnSuccessListener { barcode -> barcode.rawValue?.let { pair(it) } }
            .addOnFailureListener { e -> toast(getString(R.string.scan_failed, e.message ?: "unknown error")) }
    }

    private fun pairFromInput() {
        pair(binding.linkInput.text?.toString().orEmpty())
    }

    private fun pair(input: String) {
        val id = TrackerIds.extract(input)
        if (id == null) {
            binding.linkLayout.error = getString(R.string.invalid_link)
            return
        }
        binding.linkLayout.error = null
        binding.linkInput.setText("")
        switchTracker(id, null)
        toast(R.string.paired_ok)
    }

    private fun newQuickTrack() {
        switchTracker(TrackerIds.generate(), prefs.deviceName)
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.quick_track)
            .setMessage(getString(R.string.quick_track_explain) + "\n\n" + prefs.trackerId)
            .setPositiveButton(R.string.share_id) { _, _ -> shareTrackerId() }
            .setNegativeButton(android.R.string.ok, null)
            .show()
    }

    private fun switchTracker(id: String, name: String?) {
        if (id == prefs.trackerId) return
        val wasRunning = TrackingState.state.value.running
        if (wasRunning) TrackingService.send(this, TrackingService.ACTION_STOP)
        prefs.trackerId = id
        prefs.trackerName = name
        prefs.consentGiven = false
        prefs.saveQueue(emptyList())
        TrackingState.update { TrackingSnapshot(status = "stopped") }
        refreshTrackerName()
    }

    private fun refreshTrackerName() {
        val id = prefs.trackerId ?: return render(TrackingState.state.value)
        lifecycleScope.launch {
            val tracker = withContext(Dispatchers.IO) { runCatching { FirestoreClient().getTracker(id) }.getOrNull() }
            if (tracker?.exists == true && prefs.trackerId == id) {
                prefs.trackerName = tracker.name
                TrackingState.update { it.copy(sosActive = tracker.sosActive) }
            }
            render(TrackingState.state.value)
        }
    }

    private fun shareTrackerId() {
        val id = prefs.trackerId ?: return toast(R.string.pair_first)
        val text = "GeoTracker tracker ID: $id\nAdd it on the dashboard with \"Link an existing tracker\": ${BuildConfig.WEB_URL}/dashboard/"
        startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), null))
    }

    // ── Sharing ───────────────────────────────────────────────────────────

    private fun onStartClicked() {
        if (prefs.trackerId == null) return toast(R.string.pair_first)
        if (prefs.consentGiven) return requestLocationThenStart()
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.consent_title)
            .setMessage(R.string.consent_body)
            .setPositiveButton(R.string.consent_accept) { _, _ ->
                prefs.consentGiven = true
                requestLocationThenStart()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun requestLocationThenStart() {
        if (hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
            requestNotificationsThenStart()
        } else {
            locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    private fun requestNotificationsThenStart() {
        if (Build.VERSION.SDK_INT >= 33 && !hasPermission(Manifest.permission.POST_NOTIFICATIONS)) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            startSharing()
        }
    }

    private fun startSharing() {
        TrackingService.start(this)
    }

    private fun requestBackgroundLocation() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) && !hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
            // Android requires foreground access before "all the time".
            return requestLocationThenStart()
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+ only offers "Allow all the time" in system settings.
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
        } else {
            backgroundPermission.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        }
    }

    // ── SOS (hold 2 s, like the web SosButton) ────────────────────────────

    @SuppressLint("ClickableViewAccessibility")
    private fun setupSosButton() {
        val fire = Runnable {
            binding.sosButton.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
            sendSos()
        }
        binding.sosButton.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    v.isPressed = true
                    handler.postDelayed(fire, SOS_HOLD_MS)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.isPressed = false
                    handler.removeCallbacks(fire)
                }
            }
            true
        }
        // Keyboard / accessibility services: confirm instead of holding.
        binding.sosButton.setOnClickListener {
            MaterialAlertDialogBuilder(this)
                .setTitle(R.string.sos)
                .setMessage(R.string.sos_hint)
                .setPositiveButton(R.string.sos) { _, _ -> sendSos() }
                .setNegativeButton(R.string.cancel, null)
                .show()
        }
    }

    private fun sendSos() {
        if (prefs.trackerId == null) return toast(R.string.pair_first)
        SosController.trigger(this) { e ->
            runOnUiThread {
                if (e == null) toast(R.string.sos_sent) else toast(getString(R.string.sos_failed, e.message ?: "network error"))
            }
        }
    }

    // ── Rendering ─────────────────────────────────────────────────────────

    private fun render(s: TrackingSnapshot) {
        val id = prefs.trackerId
        binding.pairedText.text = if (id == null) {
            getString(R.string.not_paired)
        } else {
            getString(R.string.paired_to, prefs.trackerName ?: "—", id)
        }
        binding.shareIdButton.visibility = if (id == null) View.GONE else View.VISIBLE

        val status = if (s.running) "active" else s.status
        binding.statusText.setText(
            when (status) {
                "active" -> R.string.status_active
                "paused" -> R.string.status_paused
                else -> R.string.status_stopped
            },
        )
        binding.statusText.setTextColor(
            ContextCompat.getColor(this, if (s.running) R.color.primary else android.R.color.darker_gray),
        )
        binding.startButton.setText(if (status == "paused") R.string.resume else R.string.start)
        binding.startButton.isEnabled = !s.running && id != null
        binding.pauseButton.isEnabled = s.running
        binding.stopButton.isEnabled = s.running || status == "paused"

        binding.detailsText.text = buildString {
            s.lastFix?.let {
                append("Position  %.5f, %.5f\n".format(it.latitude, it.longitude))
                append("Accuracy  ±${it.accuracy.toInt()} m · ${s.motion}\n")
                it.speed?.let { sp -> append("Speed     %.1f km/h\n".format(sp * 3.6)) }
            }
            s.batteryLevel?.let { append("Battery   ${(it * 100).toInt()}%${if (s.charging) " ⚡" else ""}\n") }
            append("Sent      ${s.uploads}")
            if (s.queued > 0) append(" · ${s.queued} queued")
            s.lastUploadMs?.let {
                append("\nLast sent ")
                append(DateUtils.getRelativeTimeSpanString(it, System.currentTimeMillis(), DateUtils.SECOND_IN_MILLIS))
            }
        }
        binding.errorText.text = s.error
        binding.errorText.visibility = if (s.error.isNullOrBlank()) View.GONE else View.VISIBLE

        val background = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
            hasPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        binding.backgroundButton.visibility = if (background) View.GONE else View.VISIBLE

        binding.safeButton.visibility = if (s.sosActive) View.VISIBLE else View.GONE
        binding.sosText.text = when {
            s.sosActive -> getString(R.string.sos_sent)
            s.sosAcknowledged -> getString(R.string.sos_acknowledged)
            else -> getString(R.string.sos_hint)
        }
    }

    override fun onResume() {
        super.onResume()
        render(TrackingState.state.value)
    }

    private fun hasPermission(p: String) = ContextCompat.checkSelfPermission(this, p) == PackageManager.PERMISSION_GRANTED
    private fun toast(res: Int) = Toast.makeText(this, res, Toast.LENGTH_SHORT).show()
    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_LONG).show()

    companion object {
        private const val SOS_HOLD_MS = 2_000L
    }
}
