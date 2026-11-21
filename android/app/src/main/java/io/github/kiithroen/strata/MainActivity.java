package io.github.kiithroen.strata;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 앱 안에 둔 플러그인은 브리지를 만들기 전에 등록한다
        registerPlugin(AllFilesAccessPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
