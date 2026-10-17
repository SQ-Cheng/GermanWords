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
    private File pending;

    UpdateManager(MainActivity activity) { this.activity=activity; }

    private void ui(Runnable action) {
        activity.runOnUiThread(() -> { if(!closed && !activity.isFinishing()) action.run(); });
    }
    private void message(String text) { ui(() -> Toast.makeText(activity,text,Toast.LENGTH_LONG).show()); }
    void check(boolean manual) {
        if(closed || !busy.compareAndSet(false,true)) return;
        worker.execute(() -> {
            try {
                if(!manual && System.currentTimeMillis()-activity.getSharedPreferences("updates",0).getLong("lastCheck",0)<86400000L) return;
                if(config==null)try(InputStream in=activity.getAssets().open("web/app-config.json")) {
                    config=new JSONObject(new String(read(in,65536),StandardCharsets.UTF_8));
                }
                JSONObject envelope=new JSONObject(new String(download(config.getString("manifestPath"),65536),StandardCharsets.UTF_8));
                byte[] payload=Base64.decode(envelope.getString("payload"),Base64.DEFAULT);
                JSONObject key=config.getJSONObject("publicKey");
                PublicKey publicKey=KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(
                        new BigInteger(1,Base64.decode(key.getString("modulus"),Base64.DEFAULT)),
                        new BigInteger(1,Base64.decode(key.getString("exponent"),Base64.DEFAULT))));
                java.security.Signature verifier=java.security.Signature.getInstance("SHA256withRSA");
                verifier.initVerify(publicKey); verifier.update(payload);
                if(!verifier.verify(Base64.decode(envelope.getString("signature"),Base64.DEFAULT))) throw new IOException("更新信息签名无效");
                JSONObject release=new JSONObject(new String(payload,StandardCharsets.UTF_8));
                if(release.getInt("schema")!=1 || !config.getString("channel").equals(release.getString("channel"))) throw new IOException("更新通道不匹配");
                JSONObject asset=release.getJSONObject("android");
                if(!asset.getString("file").matches("GermanWords-Android-[a-zA-Z0-9.-]+\\.apk") || !asset.getString("sha256").matches("[a-f0-9]{64}") || asset.getLong("size")<=0 || asset.getLong("size")>33554432) throw new IOException("安装包信息无效");
                activity.getSharedPreferences("updates",0).edit().putLong("lastCheck",System.currentTimeMillis()).apply();
                if(release.getLong("versionCode")<=version(installed())) { if(manual)message("已是最新测试版本："+installed().versionName); return; }
                ui(() -> new AlertDialog.Builder(activity).setTitle("发现新版本 "+release.optString("versionName"))
                        .setMessage(release.optString("notes")+"\n\n下载后由系统确认安装，学习进度保留。")
                        .setNegativeButton("稍后",null).setPositiveButton("下载更新",(dialog,which) -> fetchPackage(release)).show());
            } catch(Exception e) { if(manual)message("检查更新失败："+e.getMessage()); }
            finally { busy.set(false); }
        });
    }

    private static byte[] read(InputStream in,int limit) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[16384];int count;
        while((count=in.read(buffer))!=-1) { if(out.size()+count>limit)throw new IOException("下载内容过大");out.write(buffer,0,count); }
        return out.toByteArray();
    }
    private byte[] download(String path,int limit) throws Exception {
        URL url=new URL(config.getString("shareUrl")+"files/?p="+URLEncoder.encode(path,"UTF-8")+"&raw=1&t="+System.currentTimeMillis());
        String host=new URL(config.getString("shareUrl")).getHost();
        for(int redirect=0;redirect<6;redirect++) {
            if(!"https".equals(url.getProtocol()) || !host.equals(url.getHost()))throw new IOException("不可信的下载地址");
            HttpURLConnection connection=(HttpURLConnection)url.openConnection();
            connection.setConnectTimeout(8000);connection.setReadTimeout(15000);connection.setInstanceFollowRedirects(false);connection.setRequestProperty("Cache-Control","no-cache");
            connection.setRequestProperty("User-Agent","GermanWords/"+config.getString("versionName"));
            try {
                int status=connection.getResponseCode();
                if(status==301 || status==302 || status==303 || status==307 || status==308) { url=new URL(url,connection.getHeaderField("Location"));continue; }
                if(status!=200)throw new IOException("下载服务返回 "+status);
                try(InputStream in=connection.getInputStream()) { return read(in,limit); }
            } finally { connection.disconnect(); }
        }
        throw new IOException("下载重定向次数过多");
    }
    private PackageInfo installed() throws PackageManager.NameNotFoundException {
        return activity.getPackageManager().getPackageInfo(activity.getPackageName(),signatureFlags());
    }
    private static int signatureFlags() { return Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES; }
    private static long version(PackageInfo info) { return Build.VERSION.SDK_INT>=28?info.getLongVersionCode():info.versionCode; }
    private static android.content.pm.Signature[] signers(PackageInfo info) { return Build.VERSION.SDK_INT>=28?info.signingInfo.getApkContentsSigners():info.signatures; }

    private void fetchPackage(JSONObject release) {
        if(closed || !busy.compareAndSet(false,true))return;
        message("正在下载更新，仍可继续学习…");
        worker.execute(() -> {
            File file=new File(activity.getCacheDir(),"update.apk");
            try {
                JSONObject asset=release.getJSONObject("android");
                byte[] data=download('/'+asset.getString("file"),asset.getInt("size"));
                StringBuilder hash=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(data))hash.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
                if(data.length!=asset.getInt("size") || !hash.toString().equals(asset.getString("sha256")))throw new IOException("安装包校验失败");
                try(OutputStream out=new FileOutputStream(file)) { out.write(data); }
                PackageInfo archive=activity.getPackageManager().getPackageArchiveInfo(file.getPath(),signatureFlags());
                if(archive==null || !activity.getPackageName().equals(archive.packageName) || version(archive)!=release.getLong("versionCode") || version(archive)<=version(installed()) || !Arrays.equals(signers(archive),signers(installed())))throw new IOException("安装包版本、包名或签名不匹配");
                ui(() -> {
                    pending=file;
                    if(Build.VERSION.SDK_INT>=26 && !activity.getPackageManager().canRequestPackageInstalls()) {
                        new AlertDialog.Builder(activity).setTitle("允许安装更新").setMessage("请在系统设置中允许德语单词安装应用，返回后由系统确认升级。")
                                .setNegativeButton("取消",(d,w) -> { pending=null;file.delete(); })
                                .setPositiveButton("去设置",(d,w) -> activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.getPackageName())))).show();
                    } else resumeInstall();
                });
            } catch(Exception e) { file.delete();message("更新失败："+e.getMessage()); }
            finally { busy.set(false); }
        });
    }
    void resumeInstall() {
        if(pending==null || closed || (Build.VERSION.SDK_INT>=26 && !activity.getPackageManager().canRequestPackageInstalls()))return;
        File file=pending;pending=null;
        worker.execute(() -> {
            int sessionId=-1;
            try {
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
                    session.commit(PendingIntent.getBroadcast(activity,sessionId,result,flags).getIntentSender());
                }
            } catch(Exception e) {
                if(sessionId>=0)try{activity.getPackageManager().getPackageInstaller().abandonSession(sessionId);}catch(Exception ignored){}
                message("无法启动安装："+e.getMessage());
            } finally { file.delete(); }
        });
    }
    @Override public void close() { closed=true;worker.shutdown(); }
}
