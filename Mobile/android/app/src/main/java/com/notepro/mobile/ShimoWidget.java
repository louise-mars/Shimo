package com.notepro.mobile;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class ShimoWidget extends AppWidgetProvider {

    static final String ACTION_NEW_NOTE  = "com.notepro.mobile.WIDGET_NEW_NOTE";
    static final String ACTION_VOICE     = "com.notepro.mobile.WIDGET_VOICE";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(ctx, mgr, id);
    }

    static void updateWidget(Context ctx, AppWidgetManager mgr, int widgetId) {
        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_shimo);

        // 点击"+"：打开 App 新建笔记
        Intent newIntent = new Intent(ctx, MainActivity.class);
        newIntent.setAction(ACTION_NEW_NOTE);
        newIntent.setData(Uri.parse("shimo://new"));
        newIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent newPi = PendingIntent.getActivity(ctx, widgetId,
                newIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_new_btn, newPi);

        // 点击"🎙"：打开 App 并直接触发语音
        Intent voiceIntent = new Intent(ctx, MainActivity.class);
        voiceIntent.setAction(ACTION_VOICE);
        voiceIntent.setData(Uri.parse("shimo://voice"));
        voiceIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent voicePi = PendingIntent.getActivity(ctx, widgetId + 1000,
                voiceIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_voice_btn, voicePi);

        // 点击文字区域：打开 App
        Intent openIntent = new Intent(ctx, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(ctx, widgetId + 2000,
                openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_hint, openPi);

        mgr.updateAppWidget(widgetId, views);
    }
}
