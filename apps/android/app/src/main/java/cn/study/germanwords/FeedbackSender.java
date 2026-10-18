package cn.study.germanwords;

import android.content.Context;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Uploads one user-submitted JSON report. No study data or persistent identifiers. */
final class FeedbackSender {
    static JSONObject report(JSONObject config,String message,String userAgent) throws Exception {
        message=message.trim();
        if(message.isEmpty() || message.length()>4000 || userAgent.length()>512)throw new IOException("反馈内容无效");
        return new JSONObject().put("schema",1).put("submittedAtUnixMs",System.currentTimeMillis()).put("message",message)
            .put("app",new JSONObject().put("versionName",config.getString("versionName")).put("versionCode",config.getInt("versionCode"))
                .put("channel",config.getString("channel")).put("platform","android"))
            .put("device",new JSONObject().put("os","android").put("osVersion",Build.VERSION.RELEASE).put("sdk",Build.VERSION.SDK_INT)
                .put("model",Build.MANUFACTURER+" "+Build.MODEL).put("architecture",Build.SUPPORTED_ABIS[0]).put("webviewUserAgent",userAgent));
    }

    static void send(Context context,String message,String userAgent) throws Exception {
        JSONObject config;
        try(InputStream in=context.getAssets().open("web/app-config.json")) {
            config=new JSONObject(new String(ServiceHttp.read(in,65536),StandardCharsets.UTF_8));
        }
        byte[] data=report(config,message,userAgent).toString(2).getBytes(StandardCharsets.UTF_8);
        URL share=new URL(config.getString("feedbackUploadUrl"));
        String token=share.getPath().replaceAll("/$","");token=token.substring(token.lastIndexOf('/')+1);
        String host=new URL(config.getString("shareUrl")).getHost();
        if(!"https".equals(share.getProtocol()) || !host.equals(share.getHost()) || !share.getPath().matches("/u/d/[a-f0-9]+/") || share.getUserInfo()!=null || (share.getPort()!=-1 && share.getPort()!=443))throw new IOException("反馈入口无效");
        URL endpoint=new URL("https://"+host+"/api/v2.1/upload-links/"+token+"/upload/");
        JSONObject response=new JSONObject(new String(ServiceHttp.request(endpoint,host,null,null,65536),StandardCharsets.UTF_8));
        URL upload=new URL(response.getString("upload_link")+"?ret-json=1");
        String name="feedback-android-"+UUID.randomUUID()+".json", boundary=UUID.randomUUID().toString();
        ByteArrayOutputStream body=new ByteArrayOutputStream();
        body.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"parent_dir\"\r\n\r\n"+config.getString("feedbackUploadPath")+"\r\n--"+boundary+
            "\r\nContent-Disposition: form-data; name=\"file\"; filename=\""+name+"\"\r\nContent-Type: application/json\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(data);body.write(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));
        JSONArray result=new JSONArray(new String(ServiceHttp.request(upload,host,body.toByteArray(),"multipart/form-data; boundary="+boundary,65536),StandardCharsets.UTF_8));
        if(result.length()!=1 || !name.equals(result.getJSONObject(0).getString("name")))throw new IOException("提交未确认");
    }
}
