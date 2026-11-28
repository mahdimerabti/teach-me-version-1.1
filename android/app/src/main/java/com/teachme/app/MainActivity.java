package com.teachme.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int WEBRTC_PERMISSION_REQUEST_CODE = 1001;
    private static final String CUSTOM_SCHEME = "com.teachme.app";
    private static final String CLEAN_CHROME_USER_AGENT =
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36";

    private PermissionRequest pendingWebPermissionRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        try {
            if (this.getBridge() != null && this.getBridge().getWebView() != null) {
                WebView webView = this.getBridge().getWebView();
                WebSettings settings = webView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setAllowFileAccess(false);
                settings.setMediaPlaybackRequiresUserGesture(false);

                // Use clean Mobile Chrome User-Agent so Google OAuth never rejects with 403 disallowed_useragent
                settings.setUserAgentString(CLEAN_CHROME_USER_AGENT);

                CookieManager cookieManager = CookieManager.getInstance();
                cookieManager.setAcceptCookie(true);
                cookieManager.setAcceptThirdPartyCookies(webView, true);

                // Intercept OAuth deep link callbacks directly inside the WebView
                webView.setWebViewClient(new BridgeWebViewClient(this.getBridge()) {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                        Uri uri = request != null ? request.getUrl() : null;
                        if (uri != null && isOAuthCallbackUri(uri)) {
                            deliverOAuthCallbackToWebView(uri);
                            return true;
                        }
                        return super.shouldOverrideUrlLoading(view, request);
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, String url) {
                        if (url != null) {
                            Uri uri = Uri.parse(url);
                            if (isOAuthCallbackUri(uri)) {
                                deliverOAuthCallbackToWebView(uri);
                                return true;
                            }
                        }
                        return super.shouldOverrideUrlLoading(view, url);
                    }
                });

                webView.setWebChromeClient(new BridgeWebChromeClient(this.getBridge()) {
                    @Override
                    public void onPermissionRequest(final PermissionRequest request) {
                        runOnUiThread(() -> handleWebViewPermissionRequest(request));
                    }
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        handleDeepLinkIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLinkIntent(intent);
    }

    private boolean isOAuthCallbackUri(Uri uri) {
        if (uri == null) return false;
        if (!CUSTOM_SCHEME.equalsIgnoreCase(uri.getScheme())) return false;
        String host = uri.getHost();
        return "login-callback".equalsIgnoreCase(host) || "google-auth".equalsIgnoreCase(host);
    }

    private void handleDeepLinkIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (isOAuthCallbackUri(data)) {
            deliverOAuthCallbackToWebView(data);
        }
    }

    /**
     * Extracts ?code=... or #access_token=... from the OAuth callback URI and loads the
     * in-app frontend with those tokens so Supabase automatically initializes the session
     * inside the app without leaving to an external browser.
     */
    private void deliverOAuthCallbackToWebView(final Uri callbackUri) {
        if (callbackUri == null) return;
        runOnUiThread(() -> {
            try {
                if (this.getBridge() == null || this.getBridge().getWebView() == null) return;
                WebView webView = this.getBridge().getWebView();

                String query = callbackUri.getEncodedQuery();
                String fragment = callbackUri.getEncodedFragment();

                StringBuilder suffix = new StringBuilder();
                if (query != null && !query.isEmpty()) {
                    suffix.append("?").append(query);
                }
                if (fragment != null && !fragment.isEmpty()) {
                    suffix.append("#").append(fragment);
                }

                String currentUrl = webView.getUrl();
                String baseUrl;
                if (currentUrl != null && currentUrl.startsWith("file:///android_asset/")) {
                    baseUrl = "file:///android_asset/index.html";
                } else {
                    String localUrl = this.getBridge().getLocalUrl();
                    baseUrl = (localUrl != null && !localUrl.isEmpty())
                            ? localUrl
                            : "file:///android_asset/index.html";
                }

                String targetUrl = baseUrl + suffix;
                webView.loadUrl(targetUrl);
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private boolean isTrustedMediaOrigin(Uri origin) {
        if (origin == null) return false;
        String scheme = origin.getScheme();
        String host = origin.getHost();
        if (!"https".equalsIgnoreCase(scheme) || host == null) return false;
        String h = host.toLowerCase();
        return h.equals("teachmelearn.netlify.app")
                || h.equals("teach-me-app-one.vercel.app")
                || h.equals("meet.jit.si")
                || h.endsWith(".jit.si")
                || h.equals("localhost");
    }

    private void handleWebViewPermissionRequest(final PermissionRequest request) {
        if (request == null || !isTrustedMediaOrigin(request.getOrigin())) {
            if (request != null) request.deny();
            return;
        }

        List<String> missingPermissions = new ArrayList<>();

        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                        != PackageManager.PERMISSION_GRANTED) {
                    missingPermissions.add(Manifest.permission.CAMERA);
                }
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                        != PackageManager.PERMISSION_GRANTED) {
                    missingPermissions.add(Manifest.permission.RECORD_AUDIO);
                }
            }
        }

        if (missingPermissions.isEmpty()) {
            grantAuthorizedWebResources(request);
        } else {
            this.pendingWebPermissionRequest = request;
            ActivityCompat.requestPermissions(
                    this,
                    missingPermissions.toArray(new String[0]),
                    WEBRTC_PERMISSION_REQUEST_CODE
            );
        }
    }

    private void grantAuthorizedWebResources(final PermissionRequest req) {
        List<String> allowed = new ArrayList<>();
        for (String resource : req.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                allowed.add(resource);
            } else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                allowed.add(resource);
            }
        }
        if (!allowed.isEmpty()) {
            runOnUiThread(() -> req.grant(allowed.toArray(new String[0])));
        } else {
            runOnUiThread(req::deny);
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == WEBRTC_PERMISSION_REQUEST_CODE && this.pendingWebPermissionRequest != null) {
            final PermissionRequest req = this.pendingWebPermissionRequest;
            this.pendingWebPermissionRequest = null;
            grantAuthorizedWebResources(req);
        }
    }
}
