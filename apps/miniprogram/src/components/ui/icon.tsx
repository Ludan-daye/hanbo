import { Image } from "@tarojs/components";
import home from "../../assets/icons/home.png";
import grid from "../../assets/icons/grid.png";
import user from "../../assets/icons/user.png";
import clock from "../../assets/icons/clock.png";
import calendar from "../../assets/icons/calendar.png";
import people from "../../assets/icons/people.png";
import building from "../../assets/icons/building.png";
import chart from "../../assets/icons/chart.png";
import invite from "../../assets/icons/invite.png";
import check from "../../assets/icons/check.png";
import pin from "../../assets/icons/pin.png";
import camera from "../../assets/icons/camera.png";
import shield from "../../assets/icons/shield.png";
import settings from "../../assets/icons/settings.png";

const ICONS = {
  home,
  grid,
  user,
  clock,
  calendar,
  people,
  building,
  chart,
  invite,
  check,
  pin,
  camera,
  shield,
  settings,
};
export type IconName = keyof typeof ICONS;
export const AppIcon = ({ name }: { readonly name: IconName }): JSX.Element => (
  <Image className="app-icon" src={ICONS[name]} mode="scaleToFill" />
);
