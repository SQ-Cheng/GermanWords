package cn.study.germanwords;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.widget.Toast;

public class UpdateReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        int status=intent.getIntExtra(PackageInstaller.EXTRA_STATUS,PackageInstaller.STATUS_FAILURE);
        if(status==PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirmation=intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if(confirmation!=null)context.startActivity(confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } else if(status==PackageInstaller.STATUS_SUCCESS) {
            Intent launch=context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if(launch!=null)context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } else Toast.makeText(context,"更新未完成，原版本仍可使用",Toast.LENGTH_LONG).show();
    }
}
