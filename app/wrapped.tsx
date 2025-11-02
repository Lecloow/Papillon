import { Papicons } from "@getpapillon/papicons";
import { useTheme } from "@react-navigation/native";
import { Plus } from "lucide-react-native";
import React, { useEffect, useState, useMemo } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Image, View } from "react-native";

import DevModeNotice from "@/components/DevModeNotice";
import LogIcon from "@/components/Log/LogIcon";
import { database } from "@/database";
import { useAccountStore } from '@/stores/account';
import { useLogStore } from '@/stores/logs';
import { useMagicStore } from "@/stores/magic";
import { useSettingsStore } from "@/stores/settings";
import { useAlert } from "@/ui/components/AlertProvider";
import Icon from "@/ui/components/Icon";
import Item, { Leading, Trailing } from '@/ui/components/Item';
import List from '@/ui/components/List';
import Stack from "@/ui/components/Stack";
import Typography from "@/ui/components/Typography";
import { useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import LottieView from "lottie-react-native";
import { router, useFocusEffect } from "expo-router";
import ViewContainer from "@/ui/components/ViewContainer";
import * as Linking from "expo-linking";
import Button from "@/ui/components/Button";

export default function Wrapped() {

  const { colors } = useTheme();
  const alert = useAlert();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const animation = React.useRef<LottieView>(null);
  const { t } = useTranslation();
  const theme = useTheme();

useFocusEffect(
    React.useCallback(() => {
      if (animation.current) {
        animation.current.reset();
        animation.current.play();
      }
    }, [])
  );


  return (
    <ViewContainer>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack
          padding={32}
          backgroundColor="#0060D6"
          gap={0}
          hAlign={"center"}
          vAlign={"end"}
          style={{
            width: "100%",
            flex: 1,
            borderBottomLeftRadius: 42,
            borderBottomRightRadius: 42,
            borderCurve: "continuous",
            paddingTop: insets.top + 20,
            paddingBottom: 40,
          }}
        >
          <LottieView
            autoPlay={false}
            loop={false}
            ref={animation}
            style={{
              flex: 1,
              aspectRatio: 1,
              maxHeight: 250
            }}
            source={require("@/assets/lotties/onboarding.json")}
          />
          <Stack
            flex
            vAlign="start"
            hAlign="start"
            width="100%"
            ap={6}
           >
            <Image
              source={require("@/assets/logo.png")}
              resizeMode="contain"
              style={{
                width: 136,
                height: 36,
                marginBottom: 2,
              }}
            />
            <Typography
              variant="h1"
              style={{ color: "white", fontSize: 32, lineHeight: 34 }}
            >
            {t("ONBOARDING_MAIN_TITLE")}
            </Typography>
          </Stack>
        </Stack>
        <Stack
          style={{
            padding: 20,
            paddingBottom: insets.bottom + 20,
          }}
          gap={10}
        >
          <Button
            title={t("ONBOARDING_START_BTN")}
            onPress={() => {
              router.back();
            }}
            style={{
              backgroundColor: theme.dark ? colors.border : "black",
            }}
            size="large"
            icon={
              <Papicons name={"Butterfly"} />
            }
          />
        </Stack>
      </View>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
