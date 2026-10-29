package cn.study.germanwords;

import android.app.AlertDialog;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.*;
import java.math.BigInteger;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.RSAPublicKeySpec;
import java.util.Arrays;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Native-only, user-confirmed updates. The study WebView remains local-only. */
final class UpdateManager implements AutoCloseable {
    private final MainActivity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean();
    private volatile boolean closed;
    private JSONObject config;
    private boolean permissionPrompt;
    private AlertDialog updateDialog;

    UpdateManager(MainActivity activity) {
        this.activity=activity;
        try(InputStream in=activity.getAssets().open("web/app-config.json")) {
            config=new JSONObject(new String(read(in,65536),StandardCharsets.UTF_8));
        } catch(Exception e) { config=new JSONObject(); }
    }

    String channel() {
        String value=activity.getSharedPreferences("updates",0).getString("channel","stable");
        return "beta".equals(value)?"beta":"stable";
    }
    synchronized boolean setChannel(String value) {
        if(closed || busy.get() || activity.getSharedPreferences("updates",0).contains("pendingRelease")
                || !("stable".equals(value) || "beta".equals(value)))return false;
        if(!activity.getSharedPreferences("updates",0).edit().putString("channel",value).putBoolean("channelConfirmed",true).commit())return false;
        ui(() -> activity.web.evaluateJavascript("if(document.getElementById('updateChannel'))document.getElementById('updateChannel').value=Android.getUpdateChannel()",null));
        ui(() -> { if(updateDialog!=null)updateDialog.dismiss(); check(true); });
        return true;
    }

    private void ui(Runnable action) {
        activity.runOnUiThread(() -> { if(!closed && !activity.isFinishing()) action.run(); });
    }
    private void message(String text) { ui(() -> Toast.makeText(activity,text,Toast.LENGTH_LONG).show()); }
    private void askChannel() {
        if(updateDialog!=null && updateDialog.isShowing())return;
        updateDialog=new AlertDialog.Builder(activity).setTitle("是否接收测试版更新？")
                .setMessage("选择“是”也会接收正式版更新，可随时在设置中更改。")
                .setNegativeButton("否",(dialog,which) -> chooseChannel("stable"))
                .setPositiveButton("是",(dialog,which) -> chooseChannel("beta")).show();
    }
    private void chooseChannel(String value) {
        if(!setChannel(value)) { message("无法保存更新设置，请稍后重试"); activity.web.post(() -> ui(this::askChannel)); }
    }
    synchronized void check(boolean manual) {
        if(closed)return;
        if(!activity.getSharedPreferences("updates",0).getBoolean("channelConfirmed",false)) {
            if(activity.getSharedPreferences("updates",0).contains("pendingRelease"))clearPending();
            ui(this::askChannel);return;
        }
        if(activity.getSharedPreferences("updates",0).contains("pendingRelease")) { resumeInstall(); return; }
        if(!busy.compareAndSet(false,true)) return;
        String channel=channel();
        worker.execute(() -> {
            try {
                if(!manual && System.currentTimeMillis()-activity.getSharedPreferences("updates",0).getLong("lastCheck_"+channel,0)<86400000L) return;
                JSONObject release=verifyRelease(download(config.getJSONObject("manifestPaths").getString(channel),65536),channel);
                PackageInfo installed=installed();
                boolean newer=compareVersions(release.getString("versionName"),installed.versionName)>0 && release.getLong("versionCode")>version(installed);
                activity.getSharedPreferences("updates",0).edit().putLong("lastCheck_"+channel,System.currentTimeMillis()).apply();
                if(!newer) {
                    if(manual)message("stable".equals(channel)?"当前无需升级正式版":"当前无需升级"); return;
                }
                ui(() -> {
                    if(!channel.equals(channel()))return;
                    if(updateDialog!=null)updateDialog.dismiss();
                    updateDialog=new AlertDialog.Builder(activity).setTitle("发现新版本 "+release.optString("versionName"))
                        .setMessage(release.optString("notes")+"\n\n下载后由系统确认安装，学习进度保留。")
                        .setNegativeButton("稍后",null).setPositiveButton("下载更新",(dialog,which) -> fetchPackage(release)).show();
                });
            } catch(Exception e) { if(manual)message("暂时无法检查更新，请稍后重试"); }
            finally { busy.set(false); }
        });
    }

    private JSONObject verifyRelease(byte[] data,String channel) throws Exception {
        JSONObject envelope=new JSONObject(new String(data,StandardCharsets.UTF_8));
        byte[] payload=Base64.decode(envelope.getString("payload"),Base64.DEFAULT);
        JSONObject key=config.getJSONObject("publicKey");
        PublicKey publicKey=KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(
                new BigInteger(1,Base64.decode(key.getString("modulus"),Base64.DEFAULT)),
                new BigInteger(1,Base64.decode(key.getString("exponent"),Base64.DEFAULT))));
        java.security.Signature verifier=java.security.Signature.getInstance("SHA256withRSA");
        verifier.initVerify(publicKey); verifier.update(payload);
        if(!verifier.verify(Base64.decode(envelope.getString("signature"),Base64.DEFAULT))) throw new IOException("更新信息签名无效");
        JSONObject release=new JSONObject(new String(payload,StandardCharsets.UTF_8));
        if(release.getInt("schema")!=1 || !channel.equals(release.getString("channel"))) throw new IOException("更新通道不匹配");
        JSONObject asset=release.getJSONObject("android");
        String name=release.getString("versionName");
        if("stable".equals(channel) && !name.matches("[0-9]+\\.[0-9]+\\.[0-9]+"))throw new IOException("正式版通道包含测试版本");
        if(!name.matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:-beta\\.[0-9]+)?")
                || !asset.getString("file").equals(name+"/GermanWords-Android-"+name+".apk")
                || !asset.getString("sha256").matches("[a-f0-9]{64}") || asset.getLong("size")<=0 || asset.getLong("size")>33554432)throw new IOException("安装包信息无效");
        return release;
    }

    private static byte[] read(InputStream in,int limit) throws IOException { return ServiceHttp.read(in,limit); }
    private byte[] download(String path,int limit) throws Exception {
        URL url=new URL(config.getString("shareUrl")+"files/?p="+URLEncoder.encode(path,"UTF-8")+"&raw=1&t="+System.currentTimeMillis());
        return ServiceHttp.request(url,new URL(config.getString("shareUrl")).getHost(),null,null,limit);
    }
    private PackageInfo installed() throws PackageManager.NameNotFoundException {
        return activity.getPackageManager().getPackageInfo(activity.getPackageName(),signatureFlags());
    }
    private static int signatureFlags() { return Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES; }
    private static long version(PackageInfo info) { return Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode; }
    static int compareVersions(String left,String right) {
        if(!left.matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:-beta\\.[0-9]+)?")
                || !right.matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:-beta\\.[0-9]+)?"))throw new IllegalArgumentException("版本格式无效");
        String[] a=left.split("-beta\\.",2), b=right.split("-beta\\.",2);
        String[] x=a[0].split("\\."), y=b[0].split("\\.");
        for(int i=0;i<3;i++) {
            int compared=Long.compare(Long.parseLong(x[i]),Long.parseLong(y[i]));
            if(compared!=0)return compared;
        }
        if(a.length!=b.length)return Integer.compare(b.length,a.length);
        return a.length==1?0:Long.compare(Long.parseLong(a[1]),Long.parseLong(b[1]));
    }
    private static android.content.pm.Signature[] signers(PackageInfo info) { return Build.VERSION.SDK_INT>=28?info.signingInfo.getApkContentsSigners():info.signatures; }

    private synchronized void fetchPackage(JSONObject release) {
        if(!channel().equals(release.optString("channel")))return;
        if(closed || !busy.compareAndSet(false,true))return;
        message("正在下载更新，仍可继续学习…");
        worker.execute(() -> {
            File file=null;
            boolean saved=false;
            try {
                file=File.createTempFile("update-", ".apk", activity.getCacheDir());
                JSONObject asset=release.getJSONObject("android");
                byte[] data=download('/'+asset.getString("file"),asset.getInt("size"));
                try(OutputStream out=new FileOutputStream(file)) { out.write(data); }
                verifyPackage(file, release);
                saved=savePending(file, release);
            } catch(Exception e) { message("更新未完成，请检查网络后重试"); }
            finally {
                if(!saved && file!=null)file.delete();
                busy.set(false);
            }
            if(saved)ui(this::resumeInstall);
        });
    }
    private void verifyPackage(File file,JSONObject release) throws Exception {
        JSONObject asset=release.getJSONObject("android");
        if(file.length()!=asset.getLong("size") || file.length()>33554432)throw new IOException("安装包大小不匹配");
        MessageDigest digest=MessageDigest.getInstance("SHA-256");
        try(InputStream in=new FileInputStream(file)) {
            byte[] buffer=new byte[16384];int count;
            while((count=in.read(buffer))!=-1)digest.update(buffer,0,count);
        }
        StringBuilder hash=new StringBuilder();for(byte value:digest.digest())hash.append(String.format(java.util.Locale.ROOT,"%02x",value&255));
        if(!hash.toString().equals(asset.getString("sha256")))throw new IOException("安装包校验失败");
        PackageInfo archive=activity.getPackageManager().getPackageArchiveInfo(file.getPath(),signatureFlags());
        if(archive==null || !activity.getPackageName().equals(archive.packageName) || !release.getString("versionName").equals(archive.versionName) || version(archive)!=release.getLong("versionCode") || version(archive)<=version(installed()) || compareVersions(archive.versionName,installed().versionName)<=0 || !Arrays.equals(signers(archive),signers(installed())))throw new IOException("安装包版本、包名或签名不匹配");
    }
    // Persist only a verified package, before leaving the Activity for system permission UI.
    private synchronized boolean savePending(File file,JSONObject release) throws IOException {
        if(closed)return false;
        if(!activity.getSharedPreferences("updates",0).edit().putString("pendingFile",file.getName())
                .putString("pendingRelease",release.toString()).commit())throw new IOException("无法保存待安装更新");
        return true;
    }
    private File pendingFile() throws IOException {
        String name=activity.getSharedPreferences("updates",0).getString("pendingFile","");
        if(!name.matches("update-[a-zA-Z0-9-]+\\.apk"))throw new IOException("待安装文件无效");
        return new File(activity.getCacheDir(),name);
    }
    private void clearPending() {
        try { pendingFile().delete(); } catch(IOException ignored) { }
        activity.getSharedPreferences("updates",0).edit().remove("pendingFile").remove("pendingRelease").commit();
    }
    void resumeInstall() {
        if(closed || busy.get() || !activity.getSharedPreferences("updates",0).contains("pendingRelease"))return;
        if(Build.VERSION.SDK_INT>=26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            if(permissionPrompt)return;
            permissionPrompt=true;
            new AlertDialog.Builder(activity).setTitle("允许安装更新").setMessage("请在系统设置中允许德语单词安装应用，返回后由系统确认升级。")
                    .setNegativeButton("取消",(d,w) -> clearPending())
                    .setOnCancelListener(d -> clearPending())
                    .setPositiveButton("去设置",(d,w) -> activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName()))))
                    .setOnDismissListener(d -> permissionPrompt=false).show();
            return;
        }
        if(!busy.compareAndSet(false,true))return;
        worker.execute(() -> {
            if(closed) { busy.set(false);return; }
            int sessionId=-1;
            try {
                File file=pendingFile();
                JSONObject release=new JSONObject(activity.getSharedPreferences("updates",0).getString("pendingRelease",""));
                // Cache files may disappear or change while the app is stopped. Never trust the saved state alone.
                verifyPackage(file,release);
                if(closed)return;
                PackageInstaller installer=activity.getPackageManager().getPackageInstaller();
                PackageInstaller.SessionParams params=new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
                params.setAppPackageName(activity.getPackageName());
                if(Build.VERSION.SDK_INT>=31)params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED);
                sessionId=installer.createSession(params);
                try(PackageInstaller.Session session=installer.openSession(sessionId);InputStream in=new FileInputStream(file);OutputStream out=session.openWrite("base.apk",0,file.length())) {
                    byte[] buffer=new byte[16384];int count;while((count=in.read(buffer))!=-1)out.write(buffer,0,count);session.fsync(out);
                }
                Intent result=new Intent(activity,UpdateReceiver.class);
                int flags=PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT>=31?PendingIntent.FLAG_MUTABLE:0);
                try(PackageInstaller.Session session=installer.openSession(sessionId)) {
                    synchronized(UpdateManager.this) {
                        if(closed) { session.abandon();return; }
                        session.commit(PendingIntent.getBroadcast(activity,sessionId,result,flags).getIntentSender());
                        clearPending();
                    }
                }
            } catch(Exception e) {
                if(sessionId>=0)try{activity.getPackageManager().getPackageInstaller().abandonSession(sessionId);}catch(Exception ignored){}
                clearPending();
                message("无法启动安装，请重新检查更新");
            } finally { busy.set(false); }
        });
    }
    @Override public synchronized void close() {
        closed=true;worker.shutdown();
        activity.runOnUiThread(() -> { if(updateDialog!=null)updateDialog.dismiss(); });
    }
}
