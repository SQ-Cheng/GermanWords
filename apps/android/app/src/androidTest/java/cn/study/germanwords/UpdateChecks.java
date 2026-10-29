package cn.study.germanwords;

import android.content.SharedPreferences;
import android.app.AlertDialog;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import android.util.Base64;
import org.json.JSONObject;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Exercises initial preference confirmation, saved update ownership and rejection; never opens an installer. */
final class UpdateChecks {
    static void run(MainActivity activity) throws Exception {
        SharedPreferences preferences=activity.getSharedPreferences("updates",0);
        if(preferences.contains("pendingRelease"))throw new IOException("Finish or cancel the pending real update before testing");
        String originalChannel=preferences.getString("channel",null);
        boolean confirmed=preferences.getBoolean("channelConfirmed",false);
        File file=File.createTempFile("update-", ".apk",activity.getCacheDir());
        UpdateManager first=new UpdateManager(activity), restored=new UpdateManager(activity);
        Method save=UpdateManager.class.getDeclaredMethod("savePending",File.class,JSONObject.class);
        Method pending=UpdateManager.class.getDeclaredMethod("pendingFile");
        Method clear=UpdateManager.class.getDeclaredMethod("clearPending");
        Method verify=UpdateManager.class.getDeclaredMethod("verifyPackage",File.class,JSONObject.class);
        for(Method method:new Method[]{save,pending,clear,verify})method.setAccessible(true);
        try {
            checkInitialChoice(activity,originalChannel);
            checkReleaseSignatures(first);
            try(FileOutputStream out=new FileOutputStream(file)) { out.write(1); }
            JSONObject release=new JSONObject().put("android",new JSONObject().put("size",1).put("sha256","bad"));
            if(!Boolean.TRUE.equals(save.invoke(first,file,release)))throw new IOException("Pending update was not saved");
            first.close();
            preferences.edit().remove("channelConfirmed").commit();
            first.check(false);
            if(!preferences.contains("pendingRelease"))throw new IOException("Closed manager cleared another manager's pending update");
            preferences.edit().putBoolean("channelConfirmed",true).commit();
            if(!file.equals(pending.invoke(restored)))throw new IOException("New manager cannot resume the saved file");
            if(!Boolean.FALSE.equals(save.invoke(first,file,release)))throw new IOException("Closed manager can still save a download");
            try { verify.invoke(restored,file,release);throw new IOException("Corrupt cache was accepted"); }
            catch(InvocationTargetException expected) { if(!(expected.getCause() instanceof IOException))throw expected; }
            clear.invoke(restored);
            if(preferences.contains("pendingRelease") || file.exists())throw new IOException("Cancel did not clear pending state/file");
            preferences.edit().putString("pendingFile","../unsafe.apk").commit();
            try { pending.invoke(restored);throw new IOException("Unsafe cache path was accepted"); }
            catch(InvocationTargetException expected) { if(!(expected.getCause() instanceof IOException))throw expected; }
        } finally {
            first.close();restored.close();file.delete();
            preferences.edit().remove("pendingFile").remove("pendingRelease").commit();
            SharedPreferences.Editor restore=preferences.edit().putString("channel",originalChannel);
            if(confirmed)restore.putBoolean("channelConfirmed",true);else restore.remove("channelConfirmed");
            restore.commit();
        }
    }

    private static void checkInitialChoice(MainActivity activity,String previous) throws Exception {
        Field managerField=MainActivity.class.getDeclaredField("updates");managerField.setAccessible(true);
        UpdateManager manager=(UpdateManager)managerField.get(activity);
        Field dialogField=UpdateManager.class.getDeclaredField("updateDialog");dialogField.setAccessible(true);
        Field busyField=UpdateManager.class.getDeclaredField("busy");busyField.setAccessible(true);
        java.util.concurrent.atomic.AtomicBoolean busy=(java.util.concurrent.atomic.AtomicBoolean)busyField.get(manager);
        for(int i=0;i<80 && busy.get();i++)Thread.sleep(500);
        if(busy.get())throw new IOException("Updater is still busy before initial-choice test");
        activity.getSharedPreferences("updates",0).edit().remove("channelConfirmed")
                .putString("pendingFile","update-migration-test.apk").putString("pendingRelease","{}").commit();
        CountDownLatch ready=new CountDownLatch(1);
        AtomicReference<Exception> failure=new AtomicReference<>();
        activity.runOnUiThread(() -> {
            try {
                manager.check(false);
                if(activity.getSharedPreferences("updates",0).contains("pendingRelease"))throw new IOException("Old pending package bypassed initial preference confirmation");
                AlertDialog dialog=(AlertDialog)dialogField.get(manager);
                if(dialog==null || !dialog.isShowing())throw new IOException("Initial update question was not shown");
                dialog.onBackPressed();
                if(dialog.isShowing())throw new IOException("Initial question blocks leaving for offline study");
                if(activity.getSharedPreferences("updates",0).getBoolean("channelConfirmed",false))throw new IOException("Cancel confirmed an update preference");
                manager.check(false);
                dialog=(AlertDialog)dialogField.get(manager);
                if(dialog==null || !dialog.isShowing())throw new IOException("Unanswered update question was not shown again");
                dialog.getButton("beta".equals(previous)?AlertDialog.BUTTON_POSITIVE:AlertDialog.BUTTON_NEGATIVE).performClick();
            } catch(Exception e) { failure.set(e); }
            finally { ready.countDown(); }
        });
        if(!ready.await(10,TimeUnit.SECONDS))throw new IOException("Initial question timeout");
        if(failure.get()!=null)throw failure.get();
        // AlertDialog dispatches button callbacks through its Handler after performClick returns.
        for(int i=0;i<50 && !activity.getSharedPreferences("updates",0).getBoolean("channelConfirmed",false);i++)Thread.sleep(20);
        if(!activity.getSharedPreferences("updates",0).getBoolean("channelConfirmed",false))throw new IOException("Initial choice not saved");
        UpdateManager restored=new UpdateManager(activity);
        try {
            if(!restored.channel().equals("beta".equals(previous)?"beta":"stable"))throw new IOException("Initial choice not restored");
        } finally { restored.close(); }
    }

    private static void checkReleaseSignatures(UpdateManager manager) throws Exception {
        KeyPairGenerator generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);
        KeyPair pair=generator.generateKeyPair();RSAPublicKey key=(RSAPublicKey)pair.getPublic();
        JSONObject config=new JSONObject().put("channel","beta").put("publicKey",new JSONObject()
                .put("modulus",Base64.encodeToString(key.getModulus().toByteArray(),Base64.NO_WRAP))
                .put("exponent",Base64.encodeToString(key.getPublicExponent().toByteArray(),Base64.NO_WRAP)));
        Field field=UpdateManager.class.getDeclaredField("config");field.setAccessible(true);field.set(manager,config);
        Method verify=UpdateManager.class.getDeclaredMethod("verifyRelease",byte[].class,String.class);verify.setAccessible(true);
        JSONObject release=new JSONObject().put("schema",1).put("channel","beta").put("versionCode",10).put("versionName","4.2.0-beta.6")
                .put("android",new JSONObject().put("file","4.2.0-beta.6/GermanWords-Android-4.2.0-beta.6.apk").put("size",1).put("sha256",new String(new char[64]).replace('\0','0')));
        byte[] payload=release.toString().getBytes(StandardCharsets.UTF_8);
        Signature signer=Signature.getInstance("SHA256withRSA");signer.initSign(pair.getPrivate());signer.update(payload);
        JSONObject envelope=new JSONObject().put("payload",Base64.encodeToString(payload,Base64.NO_WRAP))
                .put("signature",Base64.encodeToString(signer.sign(),Base64.NO_WRAP));
        verify.invoke(manager,envelope.toString().getBytes(StandardCharsets.UTF_8),"beta");
        try { verify.invoke(manager,envelope.toString().getBytes(StandardCharsets.UTF_8),"stable");throw new IOException("Wrong channel accepted"); }
        catch(InvocationTargetException expected) { if(!(expected.getCause() instanceof IOException))throw expected; }
        if(UpdateManager.compareVersions("4.2.1","4.2.1-beta.4")<=0
                || UpdateManager.compareVersions("4.2.1-beta.10","4.2.1-beta.9")<=0
                || UpdateManager.compareVersions("4.2.1","4.3.0-beta.1")>=0)throw new IOException("Update version ordering");
        release.put("versionCode",99);
        envelope.put("payload",Base64.encodeToString(release.toString().getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP));
        try { verify.invoke(manager,envelope.toString().getBytes(StandardCharsets.UTF_8),"beta");throw new IOException("Unsigned metadata change accepted"); }
        catch(InvocationTargetException expected) { if(!(expected.getCause() instanceof IOException))throw expected; }
    }
}
