import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
const device=vi.hoisted(()=>({chooseMedia:vi.fn(),chooseImage:vi.fn(),getLocation:vi.fn()}));
vi.mock("@tarojs/taro",()=>({default:device}));
import {chooseAttendancePhoto} from "../src/services/attendance-device";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("TARO_ENV","weapp");});
afterEach(()=>vi.unstubAllEnvs());
describe("attendance camera compatibility",()=>{
  test("WeChat uses the available media camera API and returns a photo path",async()=>{
    device.chooseMedia.mockResolvedValue({tempFiles:[{tempFilePath:"wxfile://photo.jpg",size:100,fileType:"image"}]});
    await expect(chooseAttendancePhoto()).resolves.toBe("wxfile://photo.jpg");
    expect(device.chooseMedia).toHaveBeenCalledWith({count:1,mediaType:["image"],sizeType:["compressed"],sourceType:["camera"]});
    expect(device.chooseImage).not.toHaveBeenCalled();
  });
  test("WeChat keeps the 5MB limit",async()=>{
    device.chooseMedia.mockResolvedValue({tempFiles:[{tempFilePath:"wxfile://photo.jpg",size:5*1024*1024+1,fileType:"image"}]});
    await expect(chooseAttendancePhoto()).rejects.toThrow("5MB");
  });
  test("empty camera result has actionable recovery",async()=>{
    device.chooseMedia.mockResolvedValue({tempFiles:[]});
    await expect(chooseAttendancePhoto()).rejects.toThrow("重新拍摄");
  });
  test("cancellation propagates without fabricating a photo",async()=>{
    const cancelled={errMsg:"chooseMedia:fail cancel"};device.chooseMedia.mockRejectedValue(cancelled);
    await expect(chooseAttendancePhoto()).rejects.toBe(cancelled);
  });
  test("H5 preserves its existing album and camera picker",async()=>{
    vi.stubEnv("TARO_ENV","h5");device.chooseImage.mockResolvedValue({tempFiles:[{path:"blob:photo",size:100}],tempFilePaths:["blob:photo"]});
    await expect(chooseAttendancePhoto()).resolves.toBe("blob:photo");
    expect(device.chooseImage).toHaveBeenCalledWith({count:1,sizeType:["compressed"],sourceType:["album","camera"]});
    expect(device.chooseMedia).not.toHaveBeenCalled();
  });
});
