package cn.study.germanwords;

import java.io.*;
import java.net.*;

/** Bounded native requests; neither updates nor feedback can leave the service host. */
final class ServiceHttp {
    static byte[] request(URL url, String host, byte[] body, String contentType, int limit) throws IOException {
        for(int redirect=0;redirect<6;redirect++) {
            if(!"https".equals(url.getProtocol()) || !host.equals(url.getHost()) || url.getUserInfo()!=null || (url.getPort()!=-1 && url.getPort()!=443))throw new IOException("服务地址无效");
            HttpURLConnection connection=(HttpURLConnection)url.openConnection();
            connection.setConnectTimeout(8000);connection.setReadTimeout(30000);connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Cache-Control","no-cache");connection.setRequestProperty("User-Agent","GermanWords");
            try {
                if(body!=null) {
                    connection.setRequestMethod("POST");connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type",contentType);connection.setFixedLengthStreamingMode(body.length);
                    try(OutputStream out=connection.getOutputStream()) { out.write(body); }
                }
                int status=connection.getResponseCode();
                if(body==null && (status==301 || status==302 || status==303 || status==307 || status==308)) {
                    String location=connection.getHeaderField("Location");
                    if(location==null)throw new IOException("服务响应无效");
                    url=new URL(url,location);continue;
                }
                if(status<200 || status>=300)throw new IOException("服务暂时不可用");
                try(InputStream in=connection.getInputStream()) { return read(in,limit); }
            } finally { connection.disconnect(); }
        }
        throw new IOException("服务重定向次数过多");
    }

    static byte[] read(InputStream in,int limit) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[16384];int count;
        while((count=in.read(buffer))!=-1) { if(out.size()+count>limit)throw new IOException("响应内容过大");out.write(buffer,0,count); }
        return out.toByteArray();
    }
}
