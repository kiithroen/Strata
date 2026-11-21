package io.github.kiithroen.strata;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 모든 파일 접근 권한(MANAGE_EXTERNAL_STORAGE)을 확인하고 설정 화면을 열어 요청한다.
 * 노트 사본을 내장 저장소의 공용 폴더에 두고, 앱을 다시 설치한 뒤에도 그 파일을 읽고 고치려면 이 권한이 있어야 한다.
 * 안드로이드 10 이하는 지원하지 않는다(supported: false, granted: false)
 */
@CapacitorPlugin(name = "AllFilesAccess")
public class AllFilesAccessPlugin extends Plugin {

    @PluginMethod
    public void check(PluginCall call) {
        call.resolve(result());
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (granted() || !supported()) {
            call.resolve(result());
            return;
        }
        Intent appIntent = new Intent(
            Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName())
        );
        try {
            startActivityForResult(call, appIntent, "onSettingsResult");
            return;
        } catch (ActivityNotFoundException ignored) {
            // 앱별 화면이 없는 기기는 전체 목록 화면을 연다
        }
        try {
            Intent allIntent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
            startActivityForResult(call, allIntent, "onSettingsResult");
        } catch (ActivityNotFoundException ignored) {
            call.resolve(result());
        }
    }

    @ActivityCallback
    private void onSettingsResult(PluginCall call, ActivityResult activityResult) {
        if (call != null) call.resolve(result());
    }

    private boolean supported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R;
    }

    private boolean granted() {
        return supported() && Environment.isExternalStorageManager();
    }

    private JSObject result() {
        JSObject r = new JSObject();
        r.put("granted", granted());
        r.put("supported", supported());
        return r;
    }
}
