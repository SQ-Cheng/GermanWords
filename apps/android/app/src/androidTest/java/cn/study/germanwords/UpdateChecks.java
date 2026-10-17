package cn.study.germanwords;

import android.content.SharedPreferences;
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

/** Exercises saved update ownership and rejection only; never opens an installer. */
final class UpdateChecks {
    static void run(MainActivity activity) throws Exception {
        SharedPreferences preferences=activity.getSharedPreferences("updates",0);
        if(preferences.contains("pendingRelease"))throw new IOException("Finish or cancel the pending real update before testing");
        File file=File.createTempFile("update-", ".apk",activity.getCacheDir());
        UpdateManager first=new UpdateManager(activity), restored=new UpdateManager(activity);
        Method save=UpdateManager.class.getDeclaredMethod("savePending",File.class,JSONObject.class);
        Method pending=UpdateManager.class.getDeclaredMethod("pendingFile");
        Method clear=UpdateManager.class.getDeclaredMethod("clearPending");
        Method verify=UpdateManager.class.getDeclaredMethod("verifyPackage",File.class,JSONObject.class);
        for(Method method:new Method[]{save,pending,clear,verify})method.setAccessible(true);
        try {
            checkReleaseSignatures(first);
            try(FileOutputStream out=new FileOutputStream(file)) { out.write(1); }
            JSONObject release=new JSONObject().put("android",new JSONObject().put("size",1).put("sha256","bad"));
            if(!Boolean.TRUE.equals(save.invoke(first,file,release)))throw new IOException("Pending update was not saved");
            first.close();
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
        }
    }

    private static void checkReleaseSignatures(UpdateManager manager) throws Exception {
        KeyPairGenerator generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);
        KeyPair pair=generator.generateKeyPair();RSAPublicKey key=(RSAPublicKey)pair.getPublic();
        JSONObject config=new JSONObject().put("channel","beta").put("publicKey",new JSONObject()
                .put("modulus",Base64.encodeToString(key.getModulus().toByteArray(),Base64.NO_WRAP))
                .put("exponent",Base64.encodeToString(key.getPublicExponent().toByteArray(),Base64.NO_WRAP)));
        Field field=UpdateManager.class.getDeclaredField("config");field.setAccessible(true);field.set(manager,config);
        Method verify=UpdateManager.class.getDeclaredMethod("verifyRelease",byte[].class);verify.setAccessible(true);
        JSONObject release=new JSONObject().put("schema",1).put("channel","beta").put("versionCode",10)
                .put("android",new JSONObject().put("file","GermanWords-Android-test.apk").put("size",1).put("sha256",new String(new char[64]).replace('\0','0')));
        byte[] payload=release.toString().getBytes(StandardCharsets.UTF_8);
        Signature signer=Signature.getInstance("SHA256withRSA");signer.initSign(pair.getPrivate());signer.update(payload);
        JSONObject envelope=new JSONObject().put("payload",Base64.encodeToString(payload,Base64.NO_WRAP))
                .put("signature",Base64.encodeToString(signer.sign(),Base64.NO_WRAP));
        verify.invoke(manager,(Object)envelope.toString().getBytes(StandardCharsets.UTF_8));
        release.put("versionCode",99);
        envelope.put("payload",Base64.encodeToString(release.toString().getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP));
        try { verify.invoke(manager,(Object)envelope.toString().getBytes(StandardCharsets.UTF_8));throw new IOException("Unsigned metadata change accepted"); }
        catch(InvocationTargetException expected) { if(!(expected.getCause() instanceof IOException))throw expected; }
    }
}
